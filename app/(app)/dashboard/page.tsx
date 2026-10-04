import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getEpisodeUsage } from "@/lib/entitlements";
import { NewEpisodeButton } from "./NewEpisodeButton";
import { EpisodeCard } from "./EpisodeCard";
import { PlanUsageBanner } from "./PlanUsageBanner";
import { PLAN_LOCKS_VALIDATED_EPISODE_DELETION } from "@/lib/plan";
import { episodeDisplayStatus, EPISODE_COUNTS_SELECT } from "@/lib/moduleProgress";
import { getUserAccess } from "@/lib/entitlements";
import { hasModuleAccess } from "@/lib/plan";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const podcast = await prisma.podcast.findUnique({ where: { userId: session.user.id } });
  if (!podcast) redirect("/podcast");

  const usage = await getEpisodeUsage(session.user.id);
  const access = await getUserAccess(session.user.id);
  // La phase "Prod" n'existe que pour les forfaits qui ont Script ou Invités.
  const prodEnabled = hasModuleAccess(access.plan, "script", access.extraModules) || hasModuleAccess(access.plan, "invites", access.extraModules);

  // Le plus gros SxEx en premier (S2 avant S1, E5 avant E3 au sein d'une même
  // saison), les épisodes sans saison/numéro renseignés (brouillon tout
  // juste créé) sont relégués en dernier plutôt que remontés en tête, où ils
  // n'ont pas leur place vu qu'on trie justement sur ce numéro.
  const episodes = await prisma.episode.findMany({
    where: { podcastId: podcast.id },
    orderBy: [
      { season: { sort: "desc", nulls: "last" } },
      { episodeNumber: { sort: "desc", nulls: "last" } },
      { createdAt: "desc" },
    ],
    include: { _count: { select: EPISODE_COUNTS_SELECT } },
  });

  return (
    <main className="p-8 max-w-6xl w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{podcast.title}</h1>
          <p className="text-sm text-text-muted">Vos épisodes</p>
        </div>
        <NewEpisodeButton />
      </div>

      <PlanUsageBanner usage={usage} />

      {episodes.length === 0 ? (
        <p className="text-text-muted text-sm">Aucun épisode pour le moment.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {episodes.map((ep) => (
            <EpisodeCard
              key={ep.id}
              id={ep.id}
              title={ep.title}
              status={ep.status}
              displayStatus={episodeDisplayStatus(ep, ep._count, prodEnabled)}
              season={ep.season}
              episodeNumber={ep.episodeNumber}
              releaseDateLabel={ep.releaseDate ? ep.releaseDate.toLocaleDateString("fr-FR") : null}
              fallbackLabel={`Épisode du ${ep.createdAt.toLocaleDateString("fr-FR")}`}
              introTeaserChoice={ep.introTeaserChoice}
              introTeaserValidated={ep.introTeaserValidated}
              introValidatedExternally={ep.introValidatedExternally}
              montageValidatedExternally={ep.montageValidatedExternally}
              guestsCastingValidated={ep.guestsCastingValidated}
              hasTranscript={ep._count.transcriptSegments > 0}
              scriptValidated={ep.scriptValidated}
              deletionLockedWhenValidated={PLAN_LOCKS_VALIDATED_EPISODE_DELETION[usage.plan]}
            />
          ))}
        </div>
      )}
    </main>
  );
}
