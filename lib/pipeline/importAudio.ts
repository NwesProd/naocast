import { createWriteStream } from "fs";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { prisma } from "@/lib/db";
import { putLocalFile } from "@/lib/storage";
import { safeFetch } from "@/lib/safeFetch";
import { extractAudio } from "@/lib/pipeline/ffmpeg";

// Migration : copie le fichier audio d'un épisode depuis l'ancien hébergeur vers le stockage naocast. Un fichier
// qui n'est pas un mp3 est converti, car le flux annonce du mp3.
export async function runImportAudio(episodeId: string): Promise<void> {
  const episode = await prisma.episode.findUniqueOrThrow({ where: { id: episodeId } });
  if (!episode.importAudioUrl) throw new Error("Aucun fichier à copier pour cet épisode.");

  const dir = await mkdtemp(path.join(tmpdir(), "naocast-import-"));
  try {
    const res = await safeFetch(episode.importAudioUrl);
    if (!res.ok || !res.body) throw new Error(`L'ancien hébergeur a refusé le fichier (${res.status}).`);
    const type = (res.headers.get("content-type") || "").toLowerCase();
    const urlPath = new URL(res.url || episode.importAudioUrl).pathname.toLowerCase();
    const isMp3 = type.includes("audio/mpeg") || type.includes("audio/mp3") || urlPath.endsWith(".mp3");

    const source = path.join(dir, "source");
    await pipeline(Readable.fromWeb(res.body as never), createWriteStream(source));

    let upload = source;
    if (!isMp3) {
      upload = path.join(dir, "audio.mp3");
      await extractAudio(source, upload);
    }
    const storageKey = `episodes/${episodeId}/audio.mp3`;
    await putLocalFile(storageKey, upload, "audio/mpeg");
    await prisma.exportAsset.deleteMany({ where: { episodeId, type: "AUDIO" } });
    await prisma.exportAsset.create({ data: { episodeId, type: "AUDIO", storageKey } });
    // La date de publication d'origine a été posée à l'import : on ne garde plus l'adresse de l'ancien fichier.
    await prisma.episode.update({ where: { id: episodeId }, data: { importAudioUrl: null } });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
