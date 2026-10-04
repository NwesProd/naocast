import { prisma } from "@/lib/db";

// L'épisode a 7 relations directes (rushes, transcriptSegments, speakers,
// cutMarkers, jobs, exports, podcast). Avec les driver adapters de Prisma 7,
// un seul `include` combinant plusieurs relations ne produit plus un JOIN SQL
// mais plusieurs requêtes lancées EN PARALLÈLE (cf.
// @prisma/client-engine-runtime, query-interpreter), reproductible et
// systématique sur cet environnement de dev local : la connexion Postgres se
// ferme (P1017 ConnectionClosed) dès qu'une 7e requête concurrente est
// envoyée (6 relations à la fois passent, 7 échouent à coup sûr, isolé en
// conditions réelles). Contourné en récupérant chaque relation
// séquentiellement plutôt que via un `include` géant, quelques
// allers-retours de plus (~20-30ms chacun en local), négligeable au regard du
// crash que ça évite.
export async function getFullEpisode(id: string) {
  const episode = await prisma.episode.findUnique({ where: { id } });
  if (!episode) return null;

  const podcast = await prisma.podcast.findUniqueOrThrow({ where: { id: episode.podcastId } });
  const rushes = await prisma.rushSource.findMany({ where: { episodeId: id }, orderBy: { createdAt: "asc" } });
  const transcriptSegments = await prisma.transcriptSegment.findMany({
    where: { episodeId: id },
    orderBy: { startMs: "asc" },
  });
  const speakers = await prisma.episodeSpeaker.findMany({ where: { episodeId: id }, orderBy: { label: "asc" } });
  const cutMarkers = await prisma.cutMarker.findMany({ where: { episodeId: id }, orderBy: { startMs: "asc" } });
  const jobs = await prisma.processingJob.findMany({ where: { episodeId: id }, orderBy: { sequence: "asc" } });
  const exports = await prisma.exportAsset.findMany({ where: { episodeId: id } });
  const cutSuggestions = await prisma.cutSuggestion.findMany({ where: { episodeId: id }, orderBy: { startMs: "asc" } });

  return { ...episode, podcast, rushes, transcriptSegments, speakers, cutMarkers, cutSuggestions, jobs, exports };
}

// "S1E98 Titre de l'épisode", même format que celui déjà affiché dans la
// sidebar (cf. components/SidebarNav.tsx), réutilisé ici pour nommer les
// fichiers téléchargés (transcript, intro) de façon reconnaissable plutôt que
// des noms génériques ("transcript.txt").
export function episodeLabel(episode: { season: number | null; episodeNumber: number | null; title: string | null }): string {
  const sxex = [episode.season != null ? `S${episode.season}` : null, episode.episodeNumber != null ? `E${episode.episodeNumber}` : null]
    .filter(Boolean)
    .join("");
  const title = episode.title || "Sans titre";
  return sxex ? `${sxex} ${title}` : title;
}
