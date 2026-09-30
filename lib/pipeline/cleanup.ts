import { prisma } from "@/lib/db";
import { deleteObject } from "@/lib/storage";

// Une fois l'épisode exporté (verrouillé, cf. "montage validé = pas de
// retour en arrière" dans /restart-tunnel), les rushs bruts ne servent plus
// à rien : ils pèsent souvent plusieurs centaines de Mo/Go chacun, les
// garder indéfiniment sur R2/B2 gonflerait la facture de stockage pour rien.
// Les métadonnées (RushSource) restent en base, utilisées ailleurs comme
// simple historique (ex. sélecteur de rush en relecture) ; seul le fichier
// stocké est supprimé.
export async function cleanupExportedEpisodeRushes(episodeId: string): Promise<void> {
  const rushes = await prisma.rushSource.findMany({
    where: { episodeId, OR: [{ storageKey: { not: null } }, { previewKey: { not: null } }] },
  });
  if (rushes.length === 0) return;

  await Promise.all(
    rushes.flatMap((r) => [
      r.storageKey ? deleteObject(r.storageKey).catch(() => {}) : null,
      r.previewKey ? deleteObject(r.previewKey).catch(() => {}) : null,
    ])
  );

  await prisma.rushSource.updateMany({
    where: { id: { in: rushes.map((r) => r.id) } },
    data: { storageKey: null, previewKey: null },
  });
}

// Supprime tous les fichiers stockés propres à un épisode (rushs + leurs
// aperçus, générique sur-mesure de l'épisode, teaser d'intro, exports vidéo/
// audio) avant sa suppression en base : la cascade Prisma (onDelete: Cascade)
// efface bien les lignes, mais jamais les objets R2/B2 qu'elles référencent,
// qui resteraient orphelins (et facturés) indéfiniment sinon.
export async function deleteEpisodeStorage(episodeId: string): Promise<void> {
  const [episode, rushes, exportAssets] = await Promise.all([
    prisma.episode.findUnique({ where: { id: episodeId } }),
    prisma.rushSource.findMany({ where: { episodeId } }),
    prisma.exportAsset.findMany({ where: { episodeId } }),
  ]);

  const keys = [
    ...rushes.flatMap((r) => [r.storageKey, r.previewKey]),
    ...exportAssets.map((e) => e.storageKey),
    episode?.introKey,
    episode?.outroKey,
    episode?.introTeaserKey,
    episode?.introTeaserImportKey,
  ].filter((k): k is string => !!k);

  await Promise.all(keys.map((key) => deleteObject(key).catch(() => {})));
}
