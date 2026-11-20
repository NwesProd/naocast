import { prisma } from "@/lib/db";
import { deleteObject } from "@/lib/storage";

// Enregistre la vidéo finale livrée (par l'utilisateur, un monteur ou Claude) : remplace la
// précédente, supprime l'audio qui en avait été extrait, puis demande au worker d'en extraire
// l'audio (job EXPORT_AUDIO). L'épisode passe « en traitement », puis « à relire » une fois
// l'audio prêt. Le fichier audio téléchargeable est donc toujours tiré de la vidéo finale.
export async function registerFinalVideo(episodeId: string, storageKey: string): Promise<void> {
  const previous = await prisma.exportAsset.findMany({ where: { episodeId } });

  const maxSeq = await prisma.processingJob.aggregate({ where: { episodeId }, _max: { sequence: true } });
  const sequence = (maxSeq._max.sequence ?? -1) + 1;

  await prisma.$transaction([
    prisma.exportAsset.deleteMany({ where: { episodeId } }),
    prisma.exportAsset.create({ data: { episodeId, type: "VIDEO", storageKey } }),
    prisma.processingJob.deleteMany({ where: { episodeId, type: "EXPORT_AUDIO" } }),
    prisma.processingJob.create({ data: { episodeId, type: "EXPORT_AUDIO", sequence } }),
    prisma.episode.update({ where: { id: episodeId }, data: { status: "QUEUED" } }),
  ]);

  await Promise.all(previous.filter((a) => a.storageKey !== storageKey).map((a) => deleteObject(a.storageKey).catch(() => {})));
}
