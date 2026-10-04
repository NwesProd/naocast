import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getUserAccess } from "@/lib/entitlements";
import { hasModuleAccess } from "@/lib/plan";
import { PlanLockedNotice } from "@/components/PlanLockedNotice";
import { GuestsModuleClient } from "./GuestsModuleClient";

// Module "Invités" (catégorie Prod) : gérer les invités de l'épisode (issus
// du pool du podcast ou nouvellement créés) et générer le message à leur
// envoyer, accessible dès qu'un épisode existe, comme Intro/Transcript.
export default async function GuestsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;

  const episode = await prisma.episode.findUnique({
    where: { id },
    include: {
      podcast: { select: { id: true, userId: true, title: true } },
      episodeGuests: { include: { guest: true }, orderBy: { order: "asc" } },
    },
  });
  if (!episode || episode.podcast.userId !== session.user.id) redirect("/dashboard");
  if (!episode.title) redirect(`/episodes/${id}/new`);

  const access = await getUserAccess(session.user.id);
  if (!hasModuleAccess(access.plan, "invites", access.extraModules)) {
    return (
      <main className="p-8 max-w-5xl w-full">
        <PlanLockedNotice moduleLabel="Invités" />
      </main>
    );
  }

  return (
    <main className="p-8 max-w-5xl w-full">
      <GuestsModuleClient
        episodeId={id}
        initialEpisodeGuests={episode.episodeGuests.map((eg) => ({
          id: eg.id,
          guest: {
            id: eg.guest.id,
            name: eg.guest.name,
            mediaName: eg.guest.mediaName,
            socialLinks: (eg.guest.socialLinks as { platform: string; url: string }[] | null) ?? [],
            tags: eg.guest.tags,
          },
        }))}
        initialGuestMessage={episode.guestMessage || ""}
        initialBroadcastMessage={episode.guestBroadcastMessage || ""}
        initialCastingValidated={episode.guestsCastingValidated}
      />
    </main>
  );
}
