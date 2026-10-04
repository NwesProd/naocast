import { prisma } from "@/lib/db";
import { deleteObject, deleteObjectsByPrefix } from "@/lib/storage";

// Fichiers que l'on garde toujours pour un épisode exporté : l'export vidéo et
// l'export audio, ce que l'utilisateur vient télécharger.
function exportKeepSet(episodeId: string, exportKeys: string[]): Set<string> {
  return new Set([...exportKeys, `episodes/${episodeId}/final.mp4`, `episodes/${episodeId}/audio.mp3`]);
}

// Une fois l'épisode exporté (verrouillé, cf. "montage validé = pas de
// retour en arrière" dans /restart-tunnel), seuls l'export vidéo et l'export
// audio finaux servent encore (à télécharger) : tout le reste est supprimé du
// stockage R2/B2, que l'utilisateur paie sinon indéfiniment pour rien :
// rushs bruts et leurs aperçus, génériques propres à l'épisode, teaser
// d'intro. Les métadonnées (RushSource...) restent en base comme historique,
// leurs clés sont simplement vidées.
export async function cleanupExportedEpisodeFiles(episodeId: string): Promise<void> {
  const exportAssets = await prisma.exportAsset.findMany({ where: { episodeId }, select: { storageKey: true } });
  const keep = exportKeepSet(episodeId, exportAssets.map((e) => e.storageKey));

  await deleteObjectsByPrefix(`rushes/${episodeId}/`);
  await deleteObjectsByPrefix(`episodes/${episodeId}/`, keep);

  await prisma.rushSource.updateMany({ where: { episodeId }, data: { storageKey: null, previewKey: null } });
  await prisma.episode.update({
    where: { id: episodeId },
    data: { introKey: null, outroKey: null, introTeaserKey: null, introTeaserImportKey: null },
  });
}

// Montage validé hors naocast (ou rushs devenus inutiles) : les rushs importés et leurs
// aperçus ne servent plus à personne mais sont facturés. On les supprime (fichiers,
// lignes, découpes et propositions de coupe qui s'y rapportaient). Le transcript, l'intro
// et les informations de l'épisode restent.
export async function purgeEpisodeRushes(episodeId: string): Promise<void> {
  await deleteObjectsByPrefix(`rushes/${episodeId}/`);
  await prisma.$transaction([
    prisma.rushSource.deleteMany({ where: { episodeId } }),
    prisma.cutMarker.deleteMany({ where: { episodeId } }),
    prisma.cutSuggestion.deleteMany({ where: { episodeId } }),
    prisma.episode.update({ where: { id: episodeId }, data: { transcriptRushId: null } }),
  ]);
}

// "Recommencer le montage à zéro" (avant validation) : le tunnel repart du
// début, l'utilisateur réimporte ses rushs. On supprime donc les rushs
// (fichiers, aperçus, lignes), les découpes, les jobs et les rendus précédents.
// Restent : le transcript (phrases et locuteurs, long à produire), l'intro
// (passages choisis, teaser compilé et sa validation), les informations de
// l'épisode, les invités, le script et les génériques choisis.
export async function resetEpisodeToScratch(episodeId: string): Promise<void> {
  await deleteObjectsByPrefix(`rushes/${episodeId}/`);
  // Rendus précédents (exports vidéo et audio).
  await Promise.all(["final.mp4", "audio.mp3", "preview.mp4"].map((name) => deleteObject(`episodes/${episodeId}/${name}`).catch(() => {})));

  await prisma.$transaction([
    prisma.rushSource.deleteMany({ where: { episodeId } }),
    prisma.cutMarker.deleteMany({ where: { episodeId } }),
    prisma.processingJob.deleteMany({ where: { episodeId } }),
    prisma.exportAsset.deleteMany({ where: { episodeId } }),
    // Le rush du transcript n'existe plus : la référence est vidée, les phrases restent.
    prisma.episode.update({ where: { id: episodeId }, data: { status: "DRAFT", transcriptRushId: null } }),
  ]);
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
  await sweepEpisodeStorage(episodeId);
}

// Fichiers du podcast lui-même (pochette, logo, génériques et leurs aperçus,
// documents de référence), à supprimer avec le podcast ou quand un nouveau
// fichier les remplace.
export async function deletePodcastFiles(podcast: {
  coverKey: string | null;
  logoKey: string | null;
  introKey: string | null;
  outroKey: string | null;
  introPreviewKey: string | null;
  outroPreviewKey: string | null;
  referenceFiles?: unknown;
}): Promise<void> {
  const refs = Array.isArray(podcast.referenceFiles) ? (podcast.referenceFiles as { key?: unknown }[]) : [];
  const keys = [
    podcast.coverKey,
    podcast.logoKey,
    podcast.introKey,
    podcast.outroKey,
    podcast.introPreviewKey,
    podcast.outroPreviewKey,
    ...refs.map((r) => (typeof r?.key === "string" ? r.key : null)),
  ].filter((k): k is string => !!k);
  await Promise.all(keys.map((key) => deleteObject(key).catch(() => {})));
}

// Filet de sécurité : à la suppression d'un épisode, balaie aussi tout ce qui
// reste sous ses dossiers de stockage (fichier sans ligne en base, upload
// interrompu...), que la liste de clés ci-dessus ne peut pas connaître.
export async function sweepEpisodeStorage(episodeId: string): Promise<void> {
  await deleteObjectsByPrefix(`rushes/${episodeId}/`);
  await deleteObjectsByPrefix(`episodes/${episodeId}/`);
}
