import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getUserAccess } from "@/lib/entitlements";
import { hasModuleAccess } from "@/lib/plan";
import { EPISODE_COUNTS_SELECT, firstOpenModuleHref } from "@/lib/moduleProgress";

// Porte d'entrée d'un épisode (création, clic sur sa carte) : redirige vers le premier module
// non validé auquel le forfait donne accès (Script pour un épisode neuf en infinity/lifetime,
// Intro sinon), jamais vers un module verrouillé.
export default async function EpisodeStartPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;

  const episode = await prisma.episode.findUnique({
    where: { id },
    include: { podcast: { select: { userId: true } }, _count: { select: EPISODE_COUNTS_SELECT } },
  });
  if (!episode || episode.podcast.userId !== session.user.id) redirect("/dashboard");

  const access = await getUserAccess(session.user.id);
  const prodEnabled =
    hasModuleAccess(access.plan, "script", access.extraModules) || hasModuleAccess(access.plan, "invites", access.extraModules);

  redirect(
    firstOpenModuleHref(
      id,
      {
        title: episode.title,
        status: episode.status,
        introTeaserChoice: episode.introTeaserChoice,
        introTeaserValidated: episode.introTeaserValidated,
        introValidatedExternally: episode.introValidatedExternally,
        montageValidatedExternally: episode.montageValidatedExternally,
        guestsCastingValidated: episode.guestsCastingValidated,
        hasTranscript: episode._count.transcriptSegments > 0,
        scriptValidated: episode.scriptValidated,
      },
      { prodEnabled }
    )
  );
}
