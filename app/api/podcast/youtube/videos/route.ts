import { NextResponse } from "next/server";
import { jsonResponse } from "@/lib/json";
import { requireUserId, requirePodcast } from "@/lib/authz";
import { listUploads, YouTubeError } from "@/lib/youtube";

// Vidéos récentes de la chaîne connectée, pour choisir à la main la vidéo d'un épisode.
export async function GET() {
  const userId = await requireUserId();
  const podcast = await requirePodcast(userId);
  if (!podcast.youtubeUploadsPlaylist) return NextResponse.json({ error: "Aucune chaîne YouTube connectée." }, { status: 400 });
  try {
    return jsonResponse(await listUploads(podcast.youtubeUploadsPlaylist, 100));
  } catch (err) {
    if (err instanceof YouTubeError) return NextResponse.json({ error: err.message }, { status: 502 });
    throw err;
  }
}
