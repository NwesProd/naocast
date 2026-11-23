import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getUserAccess } from "@/lib/entitlements";
import { hasModuleAccess } from "@/lib/plan";
import { PlanLockedNotice } from "@/components/PlanLockedNotice";
import { DiffusionClient } from "./DiffusionClient";
import { AudioHosting } from "./AudioHosting";
import { feedUrl, missingHostingFields } from "@/lib/rss";

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
  return (
    <main className="p-8 w-full space-y-10">
      <AudioHosting
        episodeId={id}
        hostingMode={(p.hostingMode as "NAOCAST" | "MIGRATE" | null) ?? null}
        hosting={{
          author: p.author ?? "",
          ownerEmail: p.ownerEmail ?? "",
          description: p.description ?? "",
          language: p.language,
          category: p.category ?? "",
          explicit: p.explicit,
          website: p.website ?? "",
        }}
        missing={missingHostingFields(p)}
        feedUrl={p.rssSlug ? feedUrl(p.rssSlug) : null}
        platformLinks={(p.platformLinks as never) ?? {}}
        audioReady={episode.exports.length > 0}
        published={!!episode.audioPublishedAt}
        description={episode.description ?? ""}
      />
      <DiffusionClient
        episodeId={id}
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
