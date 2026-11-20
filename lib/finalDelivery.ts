import { prisma } from "@/lib/db";
import { deleteObject } from "@/lib/storage";

export type FinalKind = "video" | "audio";

// Enregistre un fichier final livré (par l'utilisateur, un monteur ou Claude) : remplace
// l'ancien fichier du même type, puis met l'épisode à jour.
// - Vidéo sans audio : l'audio est extrait par le worker (job EXPORT_AUDIO), l'épisode passe
//   « en traitement » puis « à relire ».
// - Audio, ou vidéo quand l'audio existe déjà : l'épisode passe directement « à relire ».
// Une nouvelle version de la vidéo remplace aussi l'audio, qui est extrait de nouveau.
export async function registerFinalAsset(episodeId: string, kind: FinalKind, storageKey: string): Promise<void> {
  const type = kind === "video" ? "VIDEO" : "AUDIO";
  const previous = await prisma.exportAsset.findMany({ where: { episodeId, type } });
  const hadVideo = kind === "video" && previous.length > 0;

  let staleAudio: { storageKey: string }[] = [];
  if (hadVideo) staleAudio = await prisma.exportAsset.findMany({ where: { episodeId, type: "AUDIO" } });

  const audioMissing = kind === "video" && (hadVideo || (await prisma.exportAsset.count({ where: { episodeId, type: "AUDIO" } })) === 0);

  const maxSeq = await prisma.processingJob.aggregate({ where: { episodeId }, _max: { sequence: true } });
  const sequence = (maxSeq._max.sequence ?? -1) + 1;

  await prisma.$transaction([
    prisma.exportAsset.deleteMany({ where: { episodeId, type } }),
    ...(hadVideo ? [prisma.exportAsset.deleteMany({ where: { episodeId, type: "AUDIO" } })] : []),
    prisma.exportAsset.create({ data: { episodeId, type, storageKey } }),
    ...(audioMissing
      ? [
          prisma.processingJob.deleteMany({ where: { episodeId, type: "EXPORT_AUDIO" } }),
          prisma.processingJob.create({ data: { episodeId, type: "EXPORT_AUDIO", sequence } }),
        ]
      : []),
    prisma.episode.update({ where: { id: episodeId }, data: { status: audioMissing ? "QUEUED" : "READY_FOR_REVIEW" } }),
  ]);

  await Promise.all([...previous, ...staleAudio].filter((a) => a.storageKey !== storageKey).map((a) => deleteObject(a.storageKey).catch(() => {})));
}
