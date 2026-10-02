import path from "path";
import { randomUUID } from "crypto";
import { mkdir, rename, rm } from "fs/promises";
import { existsSync } from "fs";
import { prisma } from "@/lib/db";
import { getLocalWorkingPath, putLocalFile } from "@/lib/storage";
import {
  getDurationSec,
  detectSilences,
  computeKeepRanges,
  concatWithIntroOutro,
  renderEpisodeVideo,
  extractAudio,
  type LogoPosition,
} from "@/lib/pipeline/ffmpeg";
import { transcribeAudio } from "@/lib/pipeline/transcribe";

// Répertoire de travail par épisode : conservé entre les étapes du pipeline
// (permet de reprendre après un échec sans tout retélécharger/retraiter).
export function workDirFor(episodeId: string): string {
  return path.join(process.cwd(), ".data", "tmp", episodeId);
}

async function ensureWorkDir(episodeId: string): Promise<string> {
  const dir = workDirFor(episodeId);
  await mkdir(dir, { recursive: true });
  return dir;
}

// À appeler quand l'utilisateur ajoute une découpe manuelle après avoir déjà
// vu un rendu (étape "validation/relecture" du brief) : invalide les fichiers
// dérivés des CutMarker sans retélécharger/reconcaténer les rushs (body.mp4
// est conservé, il ne dépend pas des découpes).
export async function clearRenderArtifacts(episodeId: string): Promise<void> {
  const dir = workDirFor(episodeId);
  for (const f of ["final.mp4", "audio.mp3"]) {
    await rm(path.join(dir, f), { force: true });
  }
}

// Reprise à zéro après un échec (bouton "Relancer le processus" en
// relecture) : contrairement à clearRenderArtifacts, supprime aussi
// body.mp4, un échec peut survenir dès sa construction (FETCH_RUSHES), il
// ne faut alors pas repartir d'un fichier potentiellement absent ou corrompu.
export async function resetEpisodeWorkDir(episodeId: string): Promise<void> {
  await rm(workDirFor(episodeId), { recursive: true, force: true });
}

// Étape 1 (pipeline) : les rushs sélectionnés sont déjà rapatriés (fetchRush).
// On les concatène dans l'ordre en un fichier "body" unique, cas simple
// (pré-montage déjà fait / caméra unique), le multicam est géré à part
// (cf. lib/pipeline/multicam.ts, non implémenté).
export async function buildBody(episodeId: string, onProgress?: (fraction: number) => void): Promise<string> {
  const dir = await ensureWorkDir(episodeId);
  const bodyPath = path.join(dir, "body.mp4");
  if (existsSync(bodyPath)) return bodyPath;

  const rushes = await prisma.rushSource.findMany({
    where: { episodeId, selectedForEpisode: true, status: "READY" },
    orderBy: { createdAt: "asc" },
  });
  if (rushes.length === 0) throw new Error("Aucun rush prêt pour cet épisode.");

  const localPaths = await Promise.all(
    rushes.map((r) => getLocalWorkingPath(r.storageKey!, dir))
  );

  // Encodé sous un nom temporaire puis renommé une fois COMPLET : un process
  // tué en cours d'encodage (OOM...) laissait sinon un body.mp4 tronqué au
  // chemin attendu, que `existsSync(bodyPath)` ci-dessus prenait ensuite
  // pour valide aux tentatives suivantes (cf. getLocalWorkingPath).
  const tmpBodyPath = `${bodyPath}.building-${randomUUID()}.mp4`;
  try {
    await concatWithIntroOutro(localPaths, tmpBodyPath, onProgress);
    await rename(tmpBodyPath, bodyPath);
  } catch (err) {
    await rm(tmpBodyPath, { force: true });
    throw err;
  }
  return bodyPath;
}

// Étape 2 (pipeline) : transcription, alimente l'UI de sélection des
// passages à couper.
export async function runTranscription(episodeId: string, bodyPath: string): Promise<void> {
  const segments = await transcribeAudio(bodyPath);
  await prisma.$transaction([
    prisma.transcriptSegment.deleteMany({ where: { episodeId } }),
    prisma.transcriptSegment.createMany({
      data: segments.map((s) => ({ episodeId, startMs: s.startMs, endMs: s.endMs, text: s.text })),
    }),
  ]);
}

// Étape 4 (pipeline) : autocut, détecte les silences ≥ seuil choisi et les
// enregistre comme CutMarker(source=AUTOCUT). N'effectue pas encore la coupe :
// la coupe réelle a lieu une fois combinée avec les découpes manuelles.
export async function runAutocut(episodeId: string, bodyPath: string, thresholdMs: number): Promise<void> {
  const silences = await detectSilences(bodyPath, thresholdMs);
  await prisma.$transaction([
    prisma.cutMarker.deleteMany({ where: { episodeId, source: "AUTOCUT" } }),
    prisma.cutMarker.createMany({
      data: silences.map((s) => ({
        episodeId,
        startMs: Math.round(s.startSec * 1000),
        endMs: Math.round(s.endSec * 1000),
        source: "AUTOCUT",
      })),
    }),
  ]);
}

// Étapes 5-6 (pipeline) : calcule les découpes (autocut + manuelles), assemble
// le générique de début/fin et incruste le logo permanent, en un seul passage
// ffmpeg (cf. renderEpisodeVideo) plutôt que trois passages ffmpeg
// séquentiels (découpe, assemblage, logo), chacun réencodait l'intégralité
// de la vidéo, un coût qui se cumulait x3 pour rien puisque le résultat d'un
// passage ne fait que nourrir le suivant.
export async function renderVideo(
  episodeId: string,
  bodyPath: string,
  onProgress?: (fraction: number) => void
): Promise<string> {
  const dir = workDirFor(episodeId);
  const finalPath = path.join(dir, "final.mp4");
  // Toujours un rendu neuf : un job RENDER existe précisément pour produire
  // un nouveau rendu. L'ancien raccourci "final.mp4 existe déjà, on le
  // renvoie" sautait aussi l'envoi vers le stockage et la création de
  // l'ExportAsset : après un rendu tué par l'OOM, le fichier tronqué restait
  // sur le disque du WORKER (/retry et /rerender ne nettoient que le disque
  // du service web, un autre conteneur), le job se terminait "avec succès"
  // sans rien produire, relecture vide.
  await rm(finalPath, { force: true });

  const episode = await prisma.episode.findUniqueOrThrow({
    where: { id: episodeId },
    include: { podcast: true },
  });

  const markers = await prisma.cutMarker.findMany({ where: { episodeId } });
  const bodyDurationSec = await getDurationSec(bodyPath);

  // Marge de repli quand aucun mot voisin n'est identifiable (tout début ou
  // toute fin du transcript, ou transcript sans horodatage mot par mot pour
  // cet épisode) : compense le léger décalage des horodatages Whisper
  // (alignement par attention, pas un VAD précis au niveau du signal), sans
  // quoi on entend le tout début/la toute fin du mot supprimé.
  const CUT_LOOKBACK_MS = 150;
  const CUT_LOOKAHEAD_MS = 80;
  // Des deux côtés d'une découpe, la coupe est étendue jusqu'au dernier mot
  // CONSERVÉ juste avant / au premier mot CONSERVÉ juste après, plutôt qu'une
  // simple marge fixe autour du mot supprimé lui-même, sinon le silence ou
  // la respiration entre le passage coupé et le mot conservé voisin restait
  // intact dans le montage, perçu comme un "blanc" gênant (constaté en
  // conditions réelles des deux côtés). CUT_START_BUFFER_MS/CUT_END_BUFFER_MS
  // sont les marges gardées après ce mot précédent / avant ce mot suivant,
  // pour ne pas mordre sur leur contenu. Quand les mots se suivent sans
  // silence notable, ce calcul retombe naturellement sur la marge fixe
  // ci-dessus (cf. min/max plus bas).
  const CUT_START_BUFFER_MS = 60;
  const CUT_END_BUFFER_MS = 60;

  const transcriptSegments = await prisma.transcriptSegment.findMany({ where: { episodeId }, orderBy: { startMs: "asc" } });
  const words = transcriptSegments
    .flatMap((s) => (s.words as { startMs: number; endMs: number }[] | null) ?? [{ startMs: s.startMs, endMs: s.endMs }])
    .sort((a, b) => a.startMs - b.startMs);

  function nextWordStartAfter(ms: number): number | null {
    return words.find((w) => w.startMs > ms)?.startMs ?? null;
  }
  function previousWordEndBefore(ms: number): number | null {
    let result: number | null = null;
    for (const w of words) {
      if (w.endMs > ms) break;
      result = w.endMs;
    }
    return result;
  }

  const cutsToRemoveSec = markers.map((m) => {
    const previousWordEnd = previousWordEndBefore(m.startMs);
    const startMs =
      previousWordEnd !== null
        ? Math.min(m.startMs - CUT_LOOKBACK_MS, previousWordEnd + CUT_START_BUFFER_MS)
        : m.startMs - CUT_LOOKBACK_MS;

    const nextWordStart = nextWordStartAfter(m.endMs);
    const endMs =
      nextWordStart !== null
        ? Math.max(m.endMs, nextWordStart - CUT_END_BUFFER_MS)
        : m.endMs + CUT_LOOKAHEAD_MS;

    return {
      startSec: Math.max(0, startMs) / 1000,
      endSec: Math.min(bodyDurationSec * 1000, endMs) / 1000,
    };
  });
  const keepRanges = computeKeepRanges(bodyDurationSec, cutsToRemoveSec);
  const keptBodyDurationSec = keepRanges.reduce((sum, r) => sum + (r.endSec - r.startSec), 0);

  // Générique spécifique à l'épisode (étapes "Générique de début/fin" du
  // tunnel) si choisi, sinon celui de la config podcast par défaut.
  const introKey = episode.introSource === "EPISODE" && episode.introKey ? episode.introKey : episode.podcast.introKey;
  const outroKey = episode.outroSource === "EPISODE" && episode.outroKey ? episode.outroKey : episode.podcast.outroKey;
  let introPath = introKey ? await getLocalWorkingPath(introKey, dir) : null;
  const outroPath = outroKey ? await getLocalWorkingPath(outroKey, dir) : null;

  // Module "Intro" (étape 7, optionnelle) : le teaser déjà assemblé (cf.
  // app/api/episodes/[id]/intro-teaser) se diffuse AVANT le générique de
  // début, les deux sont concaténés en un seul "générique effectif" ici,
  // plutôt que d'étendre le filter_complex de renderEpisodeVideo pour un cas
  // optionnel : un passage ffmpeg de plus, mais seulement pour les épisodes
  // qui ont effectivement un teaser (rapide, ce sont des clips courts).
  // introTeaserChoice détermine QUEL clip (le cas échéant) : un brouillon
  // MODULE non encore validé n'est jamais utilisé (cf. Episode.introTeaserValidated).
  const introTeaserClipKey =
    episode.introTeaserChoice === "IMPORT"
      ? episode.introTeaserImportKey
      : episode.introTeaserChoice === "MODULE" && episode.introTeaserValidated
        ? episode.introTeaserKey
        : null;
  if (introTeaserClipKey) {
    const teaserPath = await getLocalWorkingPath(introTeaserClipKey, dir);
    if (introPath) {
      const combinedIntroPath = path.join(dir, "intro-with-teaser.mp4");
      await concatWithIntroOutro([teaserPath, introPath], combinedIntroPath);
      introPath = combinedIntroPath;
    } else {
      introPath = teaserPath;
    }
  }

  const introDurationSec = introPath ? await getDurationSec(introPath) : 0;

  let logo: { path: string; position: LogoPosition; enableRangesSec: [number, number][] } | null = null;
  if (episode.podcast.logoKey && episode.logoEnabled) {
    const logoPath = await getLocalWorkingPath(episode.podcast.logoKey, dir);

    // Le logo permanent reste toujours affiché sur le corps de l'épisode ;
    // seuls le générique de début et de fin peuvent être exclus (réglages
    // logoOnIntro/logoOnOutro de l'étape "Logo" du tunnel de montage).
    const bodyStart = introDurationSec;
    const bodyEnd = introDurationSec + keptBodyDurationSec;
    const outroDurationSec = outroPath ? await getDurationSec(outroPath) : 0;
    const totalDurationSec = introDurationSec + keptBodyDurationSec + outroDurationSec;

    const enableRangesSec: [number, number][] = [[bodyStart, bodyEnd]];
    if (introPath && episode.logoOnIntro) enableRangesSec.push([0, introDurationSec]);
    if (outroPath && episode.logoOnOutro) enableRangesSec.push([bodyEnd, totalDurationSec]);

    logo = { path: logoPath, position: episode.logoPosition, enableRangesSec };
  }

  // Rendu sous un nom temporaire puis renommé une fois complet (même
  // raisonnement que buildBody) : final.mp4 n'existe jamais à moitié écrit.
  const tmpFinalPath = `${finalPath}.building-${randomUUID()}.mp4`;
  try {
    await renderEpisodeVideo(bodyPath, tmpFinalPath, { keepRanges, introPath, outroPath, logo }, onProgress);
    await rename(tmpFinalPath, finalPath);
  } catch (err) {
    await rm(tmpFinalPath, { force: true });
    throw err;
  }

  const storageKey = `episodes/${episodeId}/final.mp4`;
  await putLocalFile(storageKey, finalPath, "video/mp4");
  await prisma.exportAsset.create({ data: { episodeId, type: "VIDEO", storageKey } });

  return finalPath;
}

// Export audio (piste séparée), disponible en sortie en plus du rendu vidéo.
// Le répertoire de travail n'existe pas forcément déjà : contrairement aux
// autres étapes, celle-ci peut être atteinte sans être passée par le
// pipeline automatique (épisode importé directement, cf.
// app/api/episodes/[id]/import-edited), qui seul créerait ce répertoire.
export async function runExportAudio(
  episodeId: string,
  finalVideoPath: string,
  onProgress?: (fraction: number) => void
): Promise<void> {
  const dir = await ensureWorkDir(episodeId);
  const audioPath = path.join(dir, "audio.mp3");
  await extractAudio(finalVideoPath, audioPath, onProgress);
  const storageKey = `episodes/${episodeId}/audio.mp3`;
  await putLocalFile(storageKey, audioPath, "audio/mpeg");
  await prisma.exportAsset.create({ data: { episodeId, type: "AUDIO", storageKey } });
}

// Chemin local du rendu vidéo final, quelle que soit son origine (pipeline
// automatique ou import direct d'un épisode déjà monté, cf.
// app/api/episodes/[id]/import-edited) : on part de l'ExportAsset VIDEO en
// base plutôt que de deviner un nom de fichier dans le répertoire de travail,
// qui peut avoir été vidé entre-temps (cf. clearRenderArtifacts) ou ne
// jamais avoir existé localement (import direct dans le stockage S3/R2).
export async function finalVideoPathFor(episodeId: string): Promise<string> {
  const videoExport = await prisma.exportAsset.findFirst({
    where: { episodeId, type: "VIDEO" },
    orderBy: { createdAt: "desc" },
  });
  if (!videoExport) throw new Error("Aucun export vidéo trouvé pour cet épisode.");
  return getLocalWorkingPath(videoExport.storageKey, workDirFor(episodeId));
}
