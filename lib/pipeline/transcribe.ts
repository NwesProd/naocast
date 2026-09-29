import OpenAI from "openai";
import { createReadStream } from "fs";
import { mkdtemp, readdir, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { extractAudio, runFfmpeg, getDurationSec, detectSilences } from "@/lib/pipeline/ffmpeg";

// Transcription (speech-to-text), sert à la fois à l'analyse du transfert
// (thèmes/nombre d'épisodes) et à l'interface de sélection des passages à couper.
// Utilise Whisper large-v3-turbo hébergé par Groq (API compatible OpenAI,
// donc même SDK avec juste une baseURL différente) : ~9x moins cher que
// l'API Whisper d'OpenAI, et surtout un simple appel API qui ne consomme
// aucune ressource du serveur applicatif (contrairement à un Whisper local,
// qui entrerait en concurrence avec ffmpeg pour le CPU au moindre pic
// d'utilisateurs simultanés). L'interface reste minimale pour pouvoir
// changer de fournisseur (pyannote pour la diarization multicam, etc.) sans
// toucher au reste du pipeline.
//
// Whisper limite les fichiers à 25 Mo (100 Mo sur le palier payant de Groq) :
// on extrait d'abord l'audio (mp3 mono, bien plus léger que la vidéo source)
// puis on découpe en segments de ~10 min avant transcription, en recalant
// les timestamps de chaque segment.

export interface TranscriptWord {
  text: string;
  startMs: number;
  endMs: number;
}

export interface TranscriptSegmentResult {
  startMs: number;
  endMs: number;
  text: string;
  // Horodatage de chaque mot de la phrase, permet à "Recouper un passage"
  // de sélectionner un sous-ensemble de mots plutôt que la phrase entière
  // (cf. lib/pipeline/diarize.ts pour l'assignation des locuteurs, qui reste
  // au niveau phrase).
  words: TranscriptWord[];
}

const CHUNK_DURATION_SEC = 600; // 10 min, large marge sous la limite de 25 Mo même en qualité correcte

// Whisper (y compris hébergé par Groq) peut, sur un même appel, transcrire une
// courte réplique puis s'arrêter net dès qu'elle est suivie d'un silence net,
// il "conclut" à tort que la piste est terminée et ignore tout le reste, même
// plusieurs dizaines de secondes de parole claire juste après (reproduit : un
// rush caméra commençant par "C'est parti !" suivi d'un silence de ~1.4s ne
// renvoyait que ces deux mots pour 29s de contenu, alors que le même passage
// extrait isolément se transcrivait parfaitement).
//
// Pré-découper systématiquement chaque appel au niveau de CHAQUE silence
// (comme la première version de ce correctif le faisait) élimine bien le bug,
// mais à un coût prohibitif sur un épisode d'1h : une conversation normale a
// des dizaines, parfois des centaines de pauses ≥ SILENCE_GAP_MS, chacune
// déclenchant son propre appel Whisper séquentiel, constaté en conditions
// réelles comme cause principale des échecs/lenteurs sur les épisodes longs
// (largement plus de 30 minutes de traitement pour 1h d'audio). À la place :
// un seul appel direct par fenêtre de ≤10 min (cf. CHUNK_DURATION_SEC), et un
// SOUS-découpage au niveau des silences uniquement si ce premier appel
// ressort suspect (cf. looksTruncated), le cas rare qui a motivé ce correctif
// à l'origine, pas le cas général.
const SILENCE_GAP_MS = 1200;
const SILENCE_NOISE_DB = -35;
// Si le dernier mot transcrit se termine bien avant la fin réelle du chunk,
// Whisper a probablement abandonné en cours de route plutôt que réellement
// terminé sur du silence (un vrai silence de fin ne dépasse en pratique que
// rarement quelques secondes), cf. transcribeTimeChunk. Calé sous l'écart
// observé sur le cas réel qui a motivé ce correctif (~23s de contenu perdu
// sur un rush de 29s), avec de la marge.
const TRUNCATION_GAP_THRESHOLD_SEC = 10;

function groqClient(): OpenAI {
  return new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1" });
}

export async function transcribeAudio(sourceFilePath: string): Promise<TranscriptSegmentResult[]> {
  if (!process.env.GROQ_API_KEY) {
    throw new Error(
      "GROQ_API_KEY manquant : configurez une clé API pour activer la transcription (voir .env)."
    );
  }
  const client = groqClient();
  const workDir = await mkdtemp(path.join(tmpdir(), "podtool-transcribe-"));

  try {
    const audioPath = path.join(workDir, "audio.mp3");
    await extractAudio(sourceFilePath, audioPath);

    const durationSec = await getDurationSec(audioPath);
    const results: TranscriptSegmentResult[] = [];

    const timeChunks: { path: string; offsetSec: number }[] = [];
    if (durationSec <= CHUNK_DURATION_SEC) {
      timeChunks.push({ path: audioPath, offsetSec: 0 });
    } else {
      const chunkPattern = path.join(workDir, "chunk-%03d.mp3");
      await runFfmpeg([
        "-i",
        audioPath,
        "-f",
        "segment",
        "-segment_time",
        String(CHUNK_DURATION_SEC),
        "-c",
        "copy",
        chunkPattern,
      ]);
      const files = (await readdir(workDir)).filter((f) => f.startsWith("chunk-")).sort();
      timeChunks.push(...files.map((f, i) => ({ path: path.join(workDir, f), offsetSec: i * CHUNK_DURATION_SEC })));
    }

    // Un appel direct par fenêtre, en parallèle (fenêtres indépendantes) :
    // Groq encaisse largement plusieurs requêtes simultanées, et ça évite
    // d'attendre chaque fenêtre l'une après l'autre sur un épisode long (6
    // fenêtres de 10 min pour 1h, contre des dizaines/centaines d'appels
    // séquentiels avec l'ancien découpage systématique par silence).
    const chunkResults = await Promise.all(
      timeChunks.map((tc, i) => transcribeTimeChunk(client, tc.path, tc.offsetSec, workDir, `natural-${i}`))
    );
    for (const segs of chunkResults) results.push(...segs);

    return results;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

// Transcrit une fenêtre de ≤10 min en un seul appel direct ; si le résultat
// ressort suspect (dernier mot bien avant la fin réelle de la fenêtre, cf.
// TRUNCATION_GAP_THRESHOLD_SEC), Whisper a probablement abandonné en cours de
// route (cf. bug documenté plus haut), on retente alors cette fenêtre-là
// seulement, pré-découpée au niveau de ses silences internes. Le cas courant
// (pas de troncature) ne coûte donc qu'un seul appel API, comme avant que ce
// bug ne soit découvert.
async function transcribeTimeChunk(
  client: OpenAI,
  chunkPath: string,
  offsetSec: number,
  workDir: string,
  prefix: string
): Promise<TranscriptSegmentResult[]> {
  const direct = await transcribeChunk(client, chunkPath, offsetSec);

  const lastWordEndSec = direct.length > 0 ? Math.max(...direct.flatMap((s) => s.words.map((w) => w.endMs))) / 1000 - offsetSec : 0;
  const chunkDurationSec = await getDurationSec(chunkPath);

  if (chunkDurationSec - lastWordEndSec <= TRUNCATION_GAP_THRESHOLD_SEC) {
    return direct;
  }

  const naturalChunks = await splitOnSilence(chunkPath, workDir, prefix);
  if (naturalChunks.length <= 1) {
    // Rien à sous-découper (pas de silence net détecté) : le résultat direct
    // est tout ce qu'on peut obtenir, même s'il paraît court.
    return direct;
  }

  const results: TranscriptSegmentResult[] = [];
  for (const nc of naturalChunks) {
    results.push(...(await transcribeChunk(client, nc.path, offsetSec + nc.offsetSec)));
  }
  return results;
}

// Découpe un fichier audio au milieu de chaque silence marqué détecté
// (≥ SILENCE_GAP_MS), pour isoler les répliques séparées par une vraie pause
// plutôt que de les envoyer à Whisper comme un flux continu (cf. bug
// documenté sur SILENCE_GAP_MS ci-dessus). Coupe au MILIEU du silence (jamais
// à son tout début/fin) pour ne jamais mordre sur un mot tout en gardant un
// peu de silence de part et d'autre de chaque morceau.
async function splitOnSilence(
  audioPath: string,
  workDir: string,
  prefix: string
): Promise<{ path: string; offsetSec: number }[]> {
  const durationSec = await getDurationSec(audioPath);
  const silences = await detectSilences(audioPath, SILENCE_GAP_MS, SILENCE_NOISE_DB);
  const cutPoints = silences
    .map((s) => (s.startSec + s.endSec) / 2)
    .filter((t) => t > 0.1 && t < durationSec - 0.1);
  if (cutPoints.length === 0) return [{ path: audioPath, offsetSec: 0 }];

  const bounds = [0, ...cutPoints, durationSec];
  const chunks: { path: string; offsetSec: number }[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const start = bounds[i];
    const end = bounds[i + 1];
    if (end - start < 0.3) continue; // reliquat négligeable

    // Ignore un morceau presque entièrement composé de silence détecté : sans
    // contenu réel à transcrire, Whisper y invente parfois une courte phrase
    // au lieu de renvoyer un texte vide (hallucination bien connue du modèle
    // sur du silence pur, constatée en conditions réelles sur les chutes de
    // silence en tête/fin de fichier une fois isolées par ce découpage).
    const silentOverlap = silences.reduce(
      (sum, s) => sum + Math.max(0, Math.min(end, s.endSec) - Math.max(start, s.startSec)),
      0
    );
    if (silentOverlap / (end - start) > 0.85) continue;

    const chunkPath = path.join(workDir, `${prefix}-${i}.mp3`);
    await runFfmpeg(["-i", audioPath, "-ss", String(start), "-to", String(end), "-acodec", "libmp3lame", "-q:a", "2", chunkPath]);
    chunks.push({ path: chunkPath, offsetSec: start });
  }
  return chunks;
}

// Un segment Whisper regroupe souvent plusieurs phrases sous un seul
// horodatage, trop grossier pour découper précisément (cf. étape
// "Recouper un passage" en relecture, qui coupe passage par passage). On
// demande donc aussi les horodatages par MOT ("word", en plus de "segment" :
// Groq les fournit tous les deux sans latence significative en plus pour
// "segment") pour reconstruire des phrases individuelles, chacune avec son
// propre horodatage précis, découpage plus fin, réparti sur l'ensemble du
// texte plutôt que par blocs Whisper.
async function transcribeChunk(
  client: OpenAI,
  chunkPath: string,
  offsetSec: number
): Promise<TranscriptSegmentResult[]> {
  const res = await client.audio.transcriptions.create({
    file: createReadStream(chunkPath),
    model: "whisper-large-v3-turbo",
    response_format: "verbose_json",
    timestamp_granularities: ["word", "segment"],
  });

  const words = (res as unknown as { words?: { word: string; start: number; end: number }[] }).words || [];
  if (words.length > 0) {
    return groupWordsIntoSentences(words, offsetSec);
  }

  // Repli sur les segments bruts si l'API ne renvoie aucun mot (ex. piste
  // silencieuse) : pas de découpage fin possible (un seul "mot" couvrant tout
  // le segment), mais le transcript reste utilisable.
  const segments = (res as unknown as { segments?: { start: number; end: number; text: string }[] }).segments || [];
  return segments.map((s) => {
    const startMs = Math.round((s.start + offsetSec) * 1000);
    const endMs = Math.round((s.end + offsetSec) * 1000);
    return { startMs, endMs, text: s.text.trim(), words: [{ text: s.text.trim(), startMs, endMs }] };
  });
}

// Regroupe les mots horodatés en phrases : coupe après un mot qui se termine
// par une ponctuation de fin de phrase (. ! ? …, éventuellement suivie d'un
// guillemet/parenthèse fermante). Heuristique simple (pas de vraie analyse
// linguistique, un nombre décimal ou une abréviation peut couper à tort),
// suffisante pour donner à chaque phrase un horodatage précis plutôt que de
// dépendre du découpage en blocs de Whisper.
function groupWordsIntoSentences(
  words: { word: string; start: number; end: number }[],
  offsetSec: number
): TranscriptSegmentResult[] {
  const SENTENCE_END = /[.!?…]["')\]]*$/;
  const sentences: TranscriptSegmentResult[] = [];
  let current: typeof words = [];

  for (const w of words) {
    current.push(w);
    if (SENTENCE_END.test(w.word.trim())) {
      sentences.push(buildSentence(current, offsetSec));
      current = [];
    }
  }
  if (current.length > 0) sentences.push(buildSentence(current, offsetSec));
  return sentences;
}

function buildSentence(
  words: { word: string; start: number; end: number }[],
  offsetSec: number
): TranscriptSegmentResult {
  return {
    startMs: Math.round((words[0].start + offsetSec) * 1000),
    endMs: Math.round((words[words.length - 1].end + offsetSec) * 1000),
    text: words
      .map((w) => w.word.trim())
      .join(" ")
      .replace(/\s+([,.!?…:;])/g, "$1"),
    words: words.map((w) => ({
      text: w.word.trim(),
      startMs: Math.round((w.start + offsetSec) * 1000),
      endMs: Math.round((w.end + offsetSec) * 1000),
    })),
  };
}

