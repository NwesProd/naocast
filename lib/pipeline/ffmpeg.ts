import { execFile, spawn } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";

const execFileAsync = promisify(execFile);

// Toutes les étapes du pipeline (autocut, découpe, rendu, extraction audio,
// future synchro multicam) passent par ffmpeg/ffprobe en ligne de commande,
// pas de binding node, pour rester au plus près de ce que le brief recommande
// et garder le contrôle total sur les filtres utilisés.
//
// Prérequis machine : `ffmpeg` et `ffprobe` doivent être installés
// (ex. `brew install ffmpeg`). On les cherche sur le PATH, avec un repli sur
// les emplacements Homebrew usuels : certains environnements d'exécution
// (process lancés hors d'un shell de login) n'héritent pas du PATH configuré
// par `brew shellenv` dans ~/.zprofile.
const FALLBACK_DIRS = ["/opt/homebrew/bin", "/usr/local/bin"];
const resolvedBinary = new Map<string, string>();

// Preset le plus léger en mémoire/CPU (au prix d'un fichier un peu plus
// volumineux à qualité égale) et thread unique : ces encodages tournent sur
// un conteneur à mémoire limitée (Railway), un preset plus poussé ou
// plusieurs threads font x264 allouer davantage de buffers de lookahead/
// analyse en parallèle, jusqu'à faire tuer le process par le système (OOM)
// sur un épisode un peu long ou en haute résolution (constaté en conditions
// réelles : le process reçoit SIGKILL, "ffmpeg a échoué: tué par le système").
const X264_ENCODE_ARGS = ["-c:v", "libx264", "-preset", "ultrafast", "-threads", "1"];

function resolveBinary(name: "ffmpeg" | "ffprobe"): string {
  const cached = resolvedBinary.get(name);
  if (cached) return cached;

  const fallback = FALLBACK_DIRS.map((dir) => `${dir}/${name}`).find((p) => existsSync(p));
  const resolved = fallback || name; // sinon on laisse le PATH décider (et échouer clairement sinon)
  resolvedBinary.set(name, resolved);
  return resolved;
}

export async function runFfmpeg(args: string[]): Promise<void> {
  try {
    await execFileAsync(resolveBinary("ffmpeg"), ["-y", "-hide_banner", "-loglevel", "error", ...args], {
      maxBuffer: 1024 * 1024 * 64,
    });
  } catch (err) {
    const { stderr, signal, code } = err as { stderr?: string; signal?: string | null; code?: number | null };
    // Un process tué par le système (OOM killer notamment, cf. `signal:
    // "SIGKILL"`) ne laisse aucune sortie stderr : sans ce cas, le message
    // ne montrait que le générique "Command failed: ffmpeg ...", impossible
    // à distinguer d'une vraie erreur ffmpeg silencieuse.
    const detail = stderr || (signal ? `tué par le système (signal ${signal}, probablement à court de mémoire)` : null) || `code de sortie ${code}`;
    throw new Error(`ffmpeg a échoué: ${detail}`);
  }
}

function parseFfmpegTimestamp(t: string): number {
  const m = /^(\d+):(\d+):(\d+(?:\.\d+)?)$/.exec(t.trim());
  if (!m) return 0;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

// Variante de runFfmpeg qui rapporte l'avancement (0-1) au fur et à mesure,
// via `-progress pipe:1` (ffmpeg imprime périodiquement des lignes
// `out_time=HH:MM:SS.ms` sur stdout pendant l'encodage). Nécessite
// `execFile`→`spawn` pour lire stdout en flux plutôt qu'attendre la fin du
// process. `totalDurationSec` doit être la durée attendue de la SORTIE (pas
// forcément celle de l'entrée si l'opération coupe/concatène), sinon la
// fraction calculée serait fausse.
export async function runFfmpegWithProgress(
  args: string[],
  totalDurationSec: number,
  onProgress: (fraction: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(resolveBinary("ffmpeg"), [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-progress",
      "pipe:1",
      ...args,
    ]);

    let buf = "";
    let stderr = "";
    proc.stdout.on("data", (chunk: Buffer) => {
      buf += chunk.toString();
      const lines = buf.split("\n");
      buf = lines.pop() || "";
      for (const line of lines) {
        const m = /^out_time=(.+)$/.exec(line.trim());
        if (m && totalDurationSec > 0) {
          onProgress(Math.min(1, parseFfmpegTimestamp(m[1]) / totalDurationSec));
        }
      }
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code, signal) => {
      if (code === 0) resolve();
      else {
        // Un process tué par un signal (OOM killer notamment) a `code: null`
        // et ne laisse en général aucune sortie stderr : sans lire `signal`
        // (2e argument de l'évènement "close", ignoré jusqu'ici), le message
        // ne montrait qu'un peu utile "code de sortie null".
        const detail = stderr || (signal ? `tué par le système (signal ${signal}, probablement à court de mémoire)` : `code de sortie ${code}`);
        reject(new Error(`ffmpeg a échoué: ${detail}`));
      }
    });
  });
}

export async function runFfprobe(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync(resolveBinary("ffprobe"), ["-hide_banner", ...args], {
      maxBuffer: 1024 * 1024 * 64,
    });
    return stdout;
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr;
    throw new Error(`ffprobe a échoué: ${stderr || (err as Error).message}`);
  }
}

export async function getDurationSec(filePath: string): Promise<number> {
  const out = await runFfprobe([
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);
  return parseFloat(out.trim());
}

export interface SilenceRange {
  startSec: number;
  endSec: number;
}

// Détecte les silences via le filtre silencedetect de ffmpeg. `thresholdMs` est
// la durée minimale de silence à partir de laquelle on considère qu'il faut
// couper (réglable par l'utilisateur dans le formulaire, étape 4).
export async function detectSilences(
  filePath: string,
  thresholdMs: number,
  noiseDb = -30
): Promise<SilenceRange[]> {
  const durationSec = thresholdMs / 1000;
  // ffmpeg écrit la sortie de silencedetect sur stderr QUE le process réussisse
  // ou échoue (ici il réussit toujours, `-f null -` sort en code 0), il
  // fallait donc aussi récupérer stderr sur le chemin de succès, pas
  // seulement dans le catch : sans ça, cette fonction ne détectait jamais
  // aucun silence en conditions réelles (stderr du succès jeté à la trappe).
  let stderr = "";
  try {
    const res = await execFileAsync(
      resolveBinary("ffmpeg"),
      [
        "-hide_banner",
        "-i",
        filePath,
        "-af",
        `silencedetect=noise=${noiseDb}dB:d=${durationSec}`,
        "-f",
        "null",
        "-",
      ],
      { maxBuffer: 1024 * 1024 * 64 }
    );
    stderr = res.stderr;
  } catch (err) {
    stderr = (err as { stderr?: string }).stderr || "";
  }

  const ranges: SilenceRange[] = [];
  const startRe = /silence_start:\s*([\d.]+)/g;
  const endRe = /silence_end:\s*([\d.]+)/g;
  const starts = [...stderr.matchAll(startRe)].map((m) => parseFloat(m[1]));
  const ends = [...stderr.matchAll(endRe)].map((m) => parseFloat(m[1]));
  for (let i = 0; i < Math.min(starts.length, ends.length); i++) {
    ranges.push({ startSec: starts[i], endSec: ends[i] });
  }
  return ranges;
}


export async function extractAudio(
  inputPath: string,
  outputPath: string,
  onProgress?: (fraction: number) => void
): Promise<void> {
  const args = ["-i", inputPath, "-vn", "-acodec", "libmp3lame", "-q:a", "2", outputPath];
  if (onProgress) {
    await runFfmpegWithProgress(args, await getDurationSec(inputPath), onProgress);
  } else {
    await runFfmpeg(args);
  }
}

// Transcode un fichier source (conteneur/codec quelconque : HEVC, ProRes...)
// vers du H.264/AAC dans un conteneur MP4, universellement lisible dans un
// <video> de navigateur. Sert uniquement à générer un aperçu (cf. génériques
// du podcast), le fichier original reste utilisé tel quel par le pipeline
// de rendu, ffmpeg n'ayant lui aucun problème à le décoder.
//
// Transcodé en entier (pas de coupe à quelques secondes) : le but de
// l'aperçu est de vérifier précisément quelle version du générique est
// live, du début à la fin, notamment quand le générique évolue au fil du
// temps. On reste rapide malgré ça grâce à l'encodage matériel
// (VideoToolbox) quand disponible (Mac), bien plus rapide que l'encodage
// logiciel x264 ; repli automatique sur libx264 sinon (autre OS, ou
// VideoToolbox indisponible pour ce contenu).
//
// `faststart` déplace l'index MP4 en tête de fichier pour permettre la
// lecture progressive avant téléchargement complet.
//
// `maxDurationSec` (placé juste après -i, donc appliqué en lecture, pas
// seulement en sortie, ffmpeg ne décode alors pas au-delà) : pour un aperçu
// de rush, qui peut durer une heure, on se limite aux premières secondes
// plutôt que de transcoder l'intégralité juste pour vérifier le contenu.
// Omis (undefined) pour les génériques du podcast, courts, où l'aperçu doit
// rester intégral (cf. transcodeForWebPreview).
function previewArgs(inputPath: string, outputPath: string, videoCodec: string[], maxDurationSec?: number): string[] {
  return [
    "-i",
    inputPath,
    ...(maxDurationSec ? ["-t", String(maxDurationSec)] : []),
    ...videoCodec,
    "-vf",
    "scale='min(854,iw)':-2",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    outputPath,
  ];
}

export async function transcodeForWebPreview(inputPath: string, outputPath: string, maxDurationSec?: number): Promise<void> {
  try {
    await runFfmpeg(previewArgs(inputPath, outputPath, ["-c:v", "h264_videotoolbox", "-b:v", "2M"], maxDurationSec));
  } catch {
    await runFfmpeg(previewArgs(inputPath, outputPath, [...X264_ENCODE_ARGS, "-crf", "23"], maxDurationSec));
  }
}
