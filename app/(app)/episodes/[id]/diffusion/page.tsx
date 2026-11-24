import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getUserAccess } from "@/lib/entitlements";
import { hasModuleAccess } from "@/lib/plan";
import { PlanLockedNotice } from "@/components/PlanLockedNotice";
import { DiffusionClient } from "./DiffusionClient";
import { AudioHosting } from "./AudioHosting";
import { missingHostingFields } from "@/lib/rss";
import { serverNow } from "@/lib/serverNow";
import { episodePlays } from "@/lib/audioStats";

// Module « Diffusion » (catégorie Distri) : statistiques de l'épisode (vues YouTube pour l'instant),
// avec leur évolution depuis la sortie.
export default async function DiffusionPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;

  const episode = await prisma.episode.findUnique({
    where: { id },
    include: {
      podcast: true,
      statSnapshots: { where: { source: "YOUTUBE" }, orderBy: { day: "asc" } },
      relatedContents: { orderBy: { createdAt: "asc" } },
      exports: { where: { type: "AUDIO" }, select: { id: true }, take: 1 },
    },
  });
  if (!episode || episode.podcast.userId !== session.user.id) redirect("/dashboard");
  if (!episode.title) redirect(`/episodes/${id}/new`);

  const access = await getUserAccess(session.user.id);
  if (!hasModuleAccess(access.plan, "diffusion", access.extraModules)) {
    return (
      <main className="p-8 w-full">
        <PlanLockedNotice moduleLabel="Diffusion" />
      </main>
    );
  }

  const p = episode.podcast;
  const plays = p.hostingMode ? await episodePlays(id) : null;
  // Hébergement prêt : mode choisi (migration terminée le cas échéant) et informations du podcast complètes.
  const hostingReady = !!p.hostingMode && (p.hostingMode !== "MIGRATE" || p.migrationStatus === "DONE") && missingHostingFields(p).length === 0;
  return (
    <main className="p-8 w-full">
      <DiffusionClient
        plays={plays}
        audio={
          <AudioHosting
            episodeId={id}
            hostingReady={hostingReady}
            audioReady={episode.exports.length > 0}
            publishedAt={episode.audioPublishedAt ? episode.audioPublishedAt.toISOString() : null}
            serverNow={serverNow()}
            description={episode.description ?? ""}
            audioTitle={episode.audioTitle ?? ""}
            episodeTitle={episode.title ?? ""}
          />
        }
        episodeId={id}
        validated={episode.diffusionValidated}
        connected={!!episode.podcast.youtubeUploadsPlaylist}
        channelTitle={episode.podcast.youtubeChannelTitle}
        apiConfigured={!!process.env.YOUTUBE_API_KEY}
        video={episode.youtubeVideoId ? { id: episode.youtubeVideoId, title: episode.youtubeVideoTitle ?? "Vidéo YouTube" } : null}
        releaseDate={episode.releaseDate ? episode.releaseDate.toISOString().slice(0, 10) : null}
        related={episode.relatedContents.map((r) => ({ id: r.id, videoId: r.videoId, title: r.title, views: r.views, likes: r.likes, comments: r.comments }))}
        snapshots={episode.statSnapshots.map((s) => ({ day: s.day.toISOString().slice(0, 10), views: s.views, likes: s.likes, comments: s.comments }))}
      />
    </main>
  );
}
