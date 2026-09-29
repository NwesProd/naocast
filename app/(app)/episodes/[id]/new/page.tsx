import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { EpisodeInfoForm } from "./EpisodeInfoForm";

// Informations de l'épisode : titre (obligatoire), saison, n° d'épisode et
// date de sortie (facultatifs). Atteinte en créant un épisode, ou à tout
// moment ensuite via l'icône engrenage de la liste "Épisodes", reste
// modifiable quel que soit le statut (ex. corriger un titre après export).
// À la création (titre encore vide), l'enregistrement ouvre directement le
// tunnel de montage (cf. EpisodeInfoForm) ; en modification, on reste sur
// place.
export default async function NewEpisodePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;

  const episode = await prisma.episode.findUnique({ where: { id }, include: { podcast: true } });
  if (!episode || episode.podcast.userId !== session.user.id) redirect("/dashboard");

  const initialInfo = {
    title: episode.title,
    season: episode.season,
    episodeNumber: episode.episodeNumber,
    releaseDate: episode.releaseDate ? episode.releaseDate.toISOString().slice(0, 10) : null,
  };

  // Suggestion de S/N pour un nouvel épisode : saison de l'épisode précédent,
  // numéro suivant, pas appliqué à une modification (l'épisode a déjà ses
  // propres valeurs, même vides intentionnellement).
  let suggestedInfo: { season: number | null; episodeNumber: number | null } | null = null;
  if (!episode.title) {
    const previous = await prisma.episode.findFirst({
      where: { podcastId: episode.podcastId, id: { not: id } },
      orderBy: { createdAt: "desc" },
    });
    if (previous) {
      suggestedInfo = {
        season: previous.season,
        episodeNumber: previous.episodeNumber != null ? previous.episodeNumber + 1 : null,
      };
    }
  }

  return (
    <main className="p-8 max-w-lg w-full">
      <h1 className="text-2xl font-bold mb-6">{episode.title ? "Informations de l'épisode" : "Nouvel épisode"}</h1>
      <EpisodeInfoForm episodeId={id} initialInfo={initialInfo} suggestedInfo={suggestedInfo} />
    </main>
  );
}
