import path from "path";
import { mkdir } from "fs/promises";
import { prisma } from "@/lib/db";
import { getLocalWorkingPath, putLocalFile } from "@/lib/storage";
import { extractAudio } from "@/lib/pipeline/ffmpeg";

// Répertoire de travail par épisode, utilisé par le worker (téléchargements, fichiers temporaires).
export function workDirFor(episodeId: string): string {
  return path.join(process.cwd(), ".data", "tmp", episodeId);
}

async function ensureWorkDir(episodeId: string): Promise<string> {
  const dir = workDirFor(episodeId);
  await mkdir(dir, { recursive: true });
  return dir;
}

// Extrait la piste audio (mp3) de l'épisode final déposé, quand seule la vidéo a été fournie.
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
  await prisma.exportAsset.deleteMany({ where: { episodeId, type: "AUDIO" } });
  await prisma.exportAsset.create({ data: { episodeId, type: "AUDIO", storageKey } });
}

// Chemin local de la vidéo finale déposée (cf. app/api/episodes/[id]/final) : on part de
// l'ExportAsset VIDEO en base, le fichier n'existe pas forcément sur le disque du worker.
export async function finalVideoPathFor(episodeId: string): Promise<string> {
  const videoExport = await prisma.exportAsset.findFirst({
    where: { episodeId, type: "VIDEO" },
    orderBy: { createdAt: "desc" },
  });
  if (!videoExport) throw new Error("Aucun export vidéo trouvé pour cet épisode.");
  return getLocalWorkingPath(videoExport.storageKey, workDirFor(episodeId));
}
