import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonResponse } from "@/lib/json";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";
import { assertModuleAccess, ModuleLockedError } from "@/lib/entitlements";
import { listUploads, matchVideo, fetchVideoStats, YouTubeError } from "@/lib/youtube";
import { snapshotYoutubeStats } from "@/lib/diffusionStats";

// Module Diffusion, par épisode : retrouver la vidéo YouTube par le titre (« match »), la choisir à la
// main ou la retirer (« set »), ou relever les chiffres du jour (« refresh »).
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("match") }),
  z.object({ action: z.literal("set"), videoId: z.string().min(5).max(30).nullable() }),
  z.object({ action: z.literal("refresh") }),
]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId } = await params;
  const episode = await requireOwnedEpisode(userId, episodeId);
  try {
    await assertModuleAccess(userId, "diffusion");
  } catch (err) {
    if (err instanceof ModuleLockedError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  const podcast = await prisma.podcast.findUnique({ where: { id: episode.podcastId } });
  if (!podcast?.youtubeUploadsPlaylist) return NextResponse.json({ error: "Connecte d'abord ta chaîne YouTube dans Mon podcast." }, { status: 400 });

  try {
    if (parsed.data.action === "match") {
      if (episode.youtubeVideoId) return jsonResponse({ matched: true });
      const videos = await listUploads(podcast.youtubeUploadsPlaylist, 150);
      const video = matchVideo(episode.title ?? "", episode.releaseDate, videos);
      if (!video) return jsonResponse({ matched: false });
      await prisma.episode.update({ where: { id: episodeId }, data: { youtubeVideoId: video.videoId, youtubeVideoTitle: video.title } });
      await snapshotYoutubeStats([{ id: episodeId, youtubeVideoId: video.videoId }]);
      return jsonResponse({ matched: true });
    }

    if (parsed.data.action === "set") {
      const { videoId } = parsed.data;
      if (!videoId) {
        await prisma.episode.update({ where: { id: episodeId }, data: { youtubeVideoId: null, youtubeVideoTitle: null } });
        await prisma.statSnapshot.deleteMany({ where: { episodeId, source: "YOUTUBE" } });
        return jsonResponse({ ok: true });
      }
      const stats = (await fetchVideoStats([videoId])).get(videoId);
      if (!stats) return NextResponse.json({ error: "Vidéo introuvable." }, { status: 404 });
      // Nouvelle vidéo : les anciens relevés ne la concernaient pas.
      if (episode.youtubeVideoId !== videoId) await prisma.statSnapshot.deleteMany({ where: { episodeId, source: "YOUTUBE" } });
      await prisma.episode.update({ where: { id: episodeId }, data: { youtubeVideoId: videoId, youtubeVideoTitle: stats.title } });
      await snapshotYoutubeStats([{ id: episodeId, youtubeVideoId: videoId }]);
      return jsonResponse({ ok: true });
    }

    await snapshotYoutubeStats([{ id: episodeId, youtubeVideoId: episode.youtubeVideoId }]);
    return jsonResponse({ ok: true });
  } catch (err) {
    if (err instanceof YouTubeError) return NextResponse.json({ error: err.message }, { status: 502 });
    throw err;
  }
}
