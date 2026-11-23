import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getUserAccess } from "@/lib/entitlements";
import { hasModuleAccess } from "@/lib/plan";
import { PlanLockedNotice } from "@/components/PlanLockedNotice";
import { splitScriptParts } from "@/lib/scriptText";
import { serverNow } from "@/lib/serverNow";
import { TournageClient } from "./TournageClient";

// Module « Tournage » (catégorie Prod) : préparer le jour J (date, lieu, invités prévenus), puis
// le suivre en direct (chrono, avancement dans le script, repères) et passer la main au Montage.
export default async function TournagePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;

  const episode = await prisma.episode.findUnique({
    where: { id },
    include: {
      podcast: { select: { userId: true } },
      episodeGuests: { include: { guest: { select: { name: true, mediaName: true } } }, orderBy: { order: "asc" } },
      shootMarkers: { orderBy: { atMs: "asc" } },
    },
  });
  if (!episode || episode.podcast.userId !== session.user.id) redirect("/dashboard");
  if (!episode.title) redirect(`/episodes/${id}/new`);

  const access = await getUserAccess(session.user.id);
  if (!hasModuleAccess(access.plan, "tournage", access.extraModules)) {
    return (
      <main className="p-8 w-full">
        <PlanLockedNotice moduleLabel="Tournage" />
      </main>
    );
  }

  return (
    <main className="p-8 w-full">
      <TournageClient
        episodeId={id}
        serverNowMs={serverNow()}
        shootAt={episode.shootAt ? episode.shootAt.toISOString() : null}
        shootMode={episode.shootMode}
        shootPlace={episode.shootPlace}
        startedAtMs={episode.shootStartedAt ? episode.shootStartedAt.getTime() : null}
        endedAtMs={episode.shootEndedAt ? episode.shootEndedAt.getTime() : null}
        initialPartIndex={episode.shootPartIndex}
        markers={episode.shootMarkers.map((m) => ({ id: m.id, atMs: m.atMs }))}
        guests={episode.episodeGuests.map((eg) => ({ id: eg.id, name: eg.guest.name, media: eg.guest.mediaName, notified: eg.notified }))}
        parts={splitScriptParts(episode.scriptDraft)}
      />
    </main>
  );
}
