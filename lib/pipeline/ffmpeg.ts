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

// Le navigateur sait-il lire ce fichier tel quel ? (H.264 + AAC/MP3 dans un MP4/MOV :
// le cas des exports caméra et logiciels courants.) Accepte un chemin ou une URL.
export async function isBrowserPlayable(input: string): Promise<boolean> {
  const out = await runFfprobe(["-v", "error", "-show_entries", "stream=codec_type,codec_name", "-of", "csv=p=0", input]);
  const streams = out
    .trim()
    .split("\n")
    .map((l) => l.trim().split(","))
    .filter((p) => p.length >= 2);
  const video = streams.filter((p) => p[1] === "video").map((p) => p[0]);
  const audio = streams.filter((p) => p[1] === "audio").map((p) => p[0]);
  return video.length > 0 && video.every((c) => c === "h264") && audio.every((c) => c === "aac" || c === "mp3");
}

export async function getImageDimensions(filePath: string): Promise<{ width: number; height: number }> {
  const out = await runFfprobe([
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
    "-of",
    "csv=s=x:p=0",
    filePath,
  ]);
  const [width, height] = out.trim().split("x").map(Number);
  return { width, height };
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

// Calcule les plages CONSERVÉES à partir des plages à retirer (silences
// détectés + découpes manuelles), pure fonction de plages, aucun appel
// ffmpeg : réutilisée par renderEpisodeVideo pour construire son
// filter_complex sans dupliquer ce calcul.
export function computeKeepRanges(totalDurationSec: number, cutsToRemoveSec: SilenceRange[]): SilenceRange[] {
  const sorted = [...cutsToRemoveSec].sort((a, b) => a.startSec - b.startSec);
  const keep: SilenceRange[] = [];
  let cursor = 0;
  for (const cut of sorted) {
    if (cut.startSec > cursor) keep.push({ startSec: cursor, endSec: cut.startSec });
    cursor = Math.max(cursor, cut.endSec);
  }
  if (cursor < totalDurationSec) keep.push({ startSec: cursor, endSec: totalDurationSec });
  return keep;
}

// Concatène intro + corps + outro (fichiers déjà au même format/codec attendu).
// Pour l'incrustation du logo permanent, utilise overlay en filtre séparé.
export async function concatWithIntroOutro(
  segments: string[],
  outputPath: string,
  onProgress?: (fraction: number) => void
): Promise<void> {
  if (segments.length === 1) {
    // Toujours réencodé, jamais de -c copy : certains rushs sont dans un
    // codec/conteneur incompatible avec la sortie MP4 (ex. ProRes, fréquent
    // en caméra pro/export Apple), -c copy échouerait alors avec une
    // erreur ffmpeg cryptique ("Could not find tag for codec... not
    // currently supported in container") plutôt que de simplement
    // transcoder, comme le fait déjà la branche multi-segments ci-dessous.
    const args = ["-i", segments[0], ...X264_ENCODE_ARGS, outputPath];
    if (onProgress) {
      await runFfmpegWithProgress(args, await getDurationSec(segments[0]), onProgress);
    } else {
      await runFfmpeg(args);
    }
    return;
  }
  const inputs = segments.flatMap((s) => ["-i", s]);
  const filterParts = segments.map((_, i) => `[${i}:v][${i}:a]`).join("");
  const filterComplex = `${filterParts}concat=n=${segments.length}:v=1:a=1[outv][outa]`;
  const args = [
    ...inputs,
    "-filter_complex",
    filterComplex,
    "-map",
    "[outv]",
    "-map",
    "[outa]",
    ...X264_ENCODE_ARGS,
    outputPath,
  ];

  if (onProgress) {
    const durations = await Promise.all(segments.map((s) => getDurationSec(s)));
    const totalDurationSec = durations.reduce((sum, d) => sum + d, 0);
    await runFfmpegWithProgress(args, totalDurationSec, onProgress);
  } else {
    await runFfmpeg(args);
  }
}

// Zone maximale de rendu du logo, en proportion de la vidéo (pas en pixels
// fixes), cf. Episode.logoOnIntro/logoOnOutro/logoPosition. Un pourcentage
// plutôt qu'une valeur en pixels : sinon un même réglage donne un logo
// proportionnellement énorme sur une vidéo basse résolution et
// proportionnellement minuscule en 4K.
//
// Les DEUX dimensions sont bornées (largeur ET hauteur) : le logo est réduit
// pour tenir dans cette zone tout en gardant ses proportions d'origine,
// jamais étiré pour la remplir. Sans la borne de largeur, un logo au format
// bannière (très large, peu haut) une fois mis à l'échelle sur la seule
// hauteur pouvait déborder du cadre côté droit, visuellement perçu comme
// "déformé" alors que c'était en réalité juste hors-cadre.
//
// NE PAS utiliser force_original_aspect_ratio de scale2ref pour ça : dans ce
// filtre (constaté avec ffmpeg 8, qui le signale d'ailleurs comme déprécié),
// `iw`/`ih` référencés dans les expressions w/h de l'entrée mise à l'échelle
// (le logo) sont en réalité ALIASÉS sur les dimensions de la vidéo de
// référence (main_w/main_h), pas sur les dimensions propres du logo,
// force_original_aspect_ratio=decrease finissait donc par forcer le logo au
// ratio d'aspect de la VIDÉO (ex. 16:9) plutôt qu'au sien (constaté : un
// badge rond 1024×1024 ressortait ovale, étiré au ratio de la vidéo). On
// calcule donc soi-même la taille finale à partir des vraies dimensions du
// logo (récupérées via ffprobe en amont), injectées en dur dans l'expression.
const LOGO_MAX_HEIGHT_RATIO = 0.06;
const LOGO_MAX_WIDTH_RATIO = 0.18;
const LOGO_MARGIN_PX = 24;

export type LogoPosition = "TOP_LEFT" | "TOP_RIGHT" | "BOTTOM_LEFT" | "BOTTOM_RIGHT";

const OVERLAY_POSITION: Record<LogoPosition, string> = {
  TOP_LEFT: `${LOGO_MARGIN_PX}:${LOGO_MARGIN_PX}`,
  TOP_RIGHT: `W-w-${LOGO_MARGIN_PX}:${LOGO_MARGIN_PX}`,
  BOTTOM_LEFT: `${LOGO_MARGIN_PX}:H-h-${LOGO_MARGIN_PX}`,
  BOTTOM_RIGHT: `W-w-${LOGO_MARGIN_PX}:H-h-${LOGO_MARGIN_PX}`,
};

export interface RenderEpisodeOptions {
  // Plages CONSERVÉES du corps (déjà calculées via computeKeepRanges),
  // triées et dans l'ordre, jamais vide (cf. appelant).
  keepRanges: SilenceRange[];
  introPath?: string | null;
  outroPath?: string | null;
  logo?: { path: string; position: LogoPosition; enableRangesSec: [number, number][] } | null;
  // Prévisualisation : 360p, qualité réduite, audio léger. Beaucoup plus rapide
  // à encoder et à charger que le rendu final, pour valider le montage avant.
  lowDef?: boolean;
}

// Assemble en UN SEUL passage ffmpeg ce qui prenait avant jusqu'à 3 passages
// séquentiels (découpe du corps, puis concat générique de début/fin, puis
// incrustation du logo) : chaque passage réencodait l'intégralité de la
// vidéo, un coût qui se cumulait x3 pour rien puisque le résultat d'un
// passage ne sert qu'à nourrir le suivant. Un seul filter_complex enchaîne
// trim/atrim+concat des plages conservées, concat avec le générique, puis
// overlay du logo, un seul encodage x264 pour tout l'épisode.
export async function renderEpisodeVideo(
  bodyPath: string,
  outputPath: string,
  options: RenderEpisodeOptions,
  onProgress?: (fraction: number) => void
): Promise<void> {
  const { keepRanges, introPath, outroPath, logo, lowDef } = options;
  if (keepRanges.length === 0) throw new Error("Toutes les plages sont coupées, il ne reste rien à monter.");

  const inputs: string[] = ["-i", bodyPath];
  let nextInputIdx = 1;
  let introIdx: number | null = null;
  let outroIdx: number | null = null;
  let logoIdx: number | null = null;
  if (introPath) {
    inputs.push("-i", introPath);
    introIdx = nextInputIdx++;
  }
  if (outroPath) {
    inputs.push("-i", outroPath);
    outroIdx = nextInputIdx++;
  }
  if (logo) {
    inputs.push("-i", logo.path);
    logoIdx = nextInputIdx++;
  }

  const filterParts: string[] = [];

  // 1. trim/atrim + setpts de chaque plage conservée du corps (0:v/0:a).
  keepRanges.forEach((seg, i) => {
    filterParts.push(
      `[0:v]trim=start=${seg.startSec}:end=${seg.endSec},setpts=PTS-STARTPTS[bv${i}]`,
      `[0:a]atrim=start=${seg.startSec}:end=${seg.endSec},asetpts=PTS-STARTPTS[ba${i}]`
    );
  });

  // 2. concat des plages conservées entre elles (alias direct si une seule
  // plage : pas de découpe réelle, inutile de passer par un filtre concat).
  let bodyCatV = "bv0";
  let bodyCatA = "ba0";
  if (keepRanges.length > 1) {
    const concatInputs = keepRanges.map((_, i) => `[bv${i}][ba${i}]`).join("");
    filterParts.push(`${concatInputs}concat=n=${keepRanges.length}:v=1:a=1[bodycatv][bodycata]`);
    bodyCatV = "bodycatv";
    bodyCatA = "bodycata";
  }

  // 3. concat générique de début + corps découpé + générique de fin (alias
  // direct si ni l'un ni l'autre n'est présent).
  const mainSegments: string[] = [];
  if (introIdx !== null) mainSegments.push(`[${introIdx}:v][${introIdx}:a]`);
  mainSegments.push(`[${bodyCatV}][${bodyCatA}]`);
  if (outroIdx !== null) mainSegments.push(`[${outroIdx}:v][${outroIdx}:a]`);

  let mainV = bodyCatV;
  let mainA = bodyCatA;
  if (mainSegments.length > 1) {
    filterParts.push(`${mainSegments.join("")}concat=n=${mainSegments.length}:v=1:a=1[mainv][maina]`);
    mainV = "mainv";
    mainA = "maina";
  }

  // 4. incrustation du logo (cf. commentaire au-dessus de LOGO_MAX_HEIGHT_RATIO
  // pour le détail du calcul de taille), [mainV] sert de référence à
  // scale2ref exactement comme un fichier assemblé le ferait, puisque
  // main_w/main_h résolvent sur les dimensions réelles du flux à ce point du
  // graphe, qu'il s'agisse d'un fichier d'entrée ou d'un pad filtré.
  let outV = mainV;
  if (logo && logoIdx !== null) {
    const { width: logoW, height: logoH } = await getImageDimensions(logo.path);
    const overlayPos = OVERLAY_POSITION[logo.position];
    const enableExpr = logo.enableRangesSec.map(([start, end]) => `between(t,${start.toFixed(3)},${end.toFixed(3)})`).join("+");
    filterParts.push(
      `[${logoIdx}:v][${mainV}]scale2ref=w='trunc(min(main_w*${LOGO_MAX_WIDTH_RATIO}\\,main_h*${LOGO_MAX_HEIGHT_RATIO}*${logoW}/${logoH})/2)*2':h='trunc(min(main_h*${LOGO_MAX_HEIGHT_RATIO}\\,main_w*${LOGO_MAX_WIDTH_RATIO}*${logoH}/${logoW})/2)*2'[logo][main2]`,
      `[main2][logo]overlay=${overlayPos}:enable='${enableExpr}'[outv]`
    );
    outV = "outv";
  }

  // Prévisualisation : réduction à 360 px de haut en fin de graphe (largeur
  // paire déduite), encodage plus compressé, audio AAC léger.
  if (lowDef) {
    filterParts.push(`[${outV}]scale=-2:360[lowv]`);
    outV = "lowv";
  }

  const args = [
    ...inputs,
    "-filter_complex",
    filterParts.join(";"),
    "-map",
    `[${outV}]`,
    "-map",
    `[${mainA}]`,
    ...(lowDef
      ? [...X264_ENCODE_ARGS, "-crf", "34", "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart"]
      : X264_ENCODE_ARGS),
    outputPath,
  ];

  if (onProgress) {
    const introDurationSec = introPath ? await getDurationSec(introPath) : 0;
    const outroDurationSec = outroPath ? await getDurationSec(outroPath) : 0;
    const bodyDurationSec = keepRanges.reduce((sum, r) => sum + (r.endSec - r.startSec), 0);
    await runFfmpegWithProgress(args, introDurationSec + bodyDurationSec + outroDurationSec, onProgress);
  } else {
    await runFfmpeg(args);
  }
}

// Module "Intro" : assemble un teaser à partir de passages choisis dans le
// corps de l'épisode, DANS L'ORDRE DONNÉ (pas trié chronologiquement, c'est
// justement le but, l'utilisateur choisit son propre enchaînement). Même
// principe de trim/atrim+concat que renderEpisodeVideo pour les plages
// conservées, mais sur une liste de plages arbitraire plutôt que sur le
// complément des découpes.
export async function assembleClipsInOrder(
  sourcePath: string,
  outputPath: string,
  rangesSec: { startSec: number; endSec: number }[],
  onProgress?: (fraction: number) => void
): Promise<void> {
  if (rangesSec.length === 0) throw new Error("Aucun passage sélectionné pour le teaser.");

  const filterParts: string[] = [];
  const concatInputs: string[] = [];
  rangesSec.forEach((seg, i) => {
    filterParts.push(
      `[0:v]trim=start=${seg.startSec}:end=${seg.endSec},setpts=PTS-STARTPTS[v${i}]`,
      `[0:a]atrim=start=${seg.startSec}:end=${seg.endSec},asetpts=PTS-STARTPTS[a${i}]`
    );
    concatInputs.push(`[v${i}][a${i}]`);
  });
  const filterComplex =
    rangesSec.length === 1
      ? filterParts.join(";")
      : `${filterParts.join(";")};${concatInputs.join("")}concat=n=${rangesSec.length}:v=1:a=1[outv][outa]`;
  const outV = rangesSec.length === 1 ? "v0" : "outv";
  const outA = rangesSec.length === 1 ? "a0" : "outa";

  const args = [
    "-i",
    sourcePath,
    "-filter_complex",
    filterComplex,
    "-map",
    `[${outV}]`,
    "-map",
    `[${outA}]`,
    ...X264_ENCODE_ARGS,
    outputPath,
  ];

  if (onProgress) {
    const outputDurationSec = rangesSec.reduce((sum, r) => sum + (r.endSec - r.startSec), 0);
    await runFfmpegWithProgress(args, outputDurationSec, onProgress);
  } else {
    await runFfmpeg(args);
  }
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
