import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getSignedDownloadUrl } from "@/lib/storage";
import { getUserAccess } from "@/lib/entitlements";
import { hasModuleAccess } from "@/lib/plan";
import { PlanLockedNotice } from "@/components/PlanLockedNotice";
import { MiniatureClient } from "./MiniatureClient";

// Module « Miniature » (catégorie Post-prod) : la miniature vidéo et la pochette audio de l'épisode, importées ici.
// La pochette audio est reprise par le flux RSS (Apple Podcasts, Spotify, Deezer).
export default async function MiniaturePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;

  const episode = await prisma.episode.findUnique({ where: { id }, include: { podcast: { select: { userId: true, coverKey: true } } } });
  if (!episode || episode.podcast.userId !== session.user.id) redirect("/dashboard");
  if (!episode.title) redirect(`/episodes/${id}/new`);

  const access = await getUserAccess(session.user.id);
  if (!hasModuleAccess(access.plan, "miniature", access.extraModules)) {
    return (
      <main className="p-8 w-full">
        <PlanLockedNotice moduleLabel="Miniature" />
      </main>
    );
  }

  const nameOf = (key: string) => (key.split("/").pop() || key).slice(37);
  return (
    <main className="p-8 w-full">
      <MiniatureClient
        episodeId={id}
        validated={episode.miniatureValidated}
        autoValidated={!!episode.coverKey && !!episode.thumbnailKey}
        cover={episode.coverKey ? { url: await getSignedDownloadUrl(episode.coverKey), downloadUrl: await getSignedDownloadUrl(episode.coverKey, 3600, nameOf(episode.coverKey)) } : null}
        thumbnail={
          episode.thumbnailKey
            ? { url: await getSignedDownloadUrl(episode.thumbnailKey), downloadUrl: await getSignedDownloadUrl(episode.thumbnailKey, 3600, nameOf(episode.thumbnailKey)) }
            : null
        }
        podcastCoverUsed={!episode.coverKey && !!episode.podcast.coverKey}
      />
    </main>
  );
}
