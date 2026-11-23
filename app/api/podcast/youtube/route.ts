import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonResponse } from "@/lib/json";
import { requireUserId, requirePodcast } from "@/lib/authz";
import { assertModuleAccess, ModuleLockedError } from "@/lib/entitlements";
import { resolveChannel, YouTubeError } from "@/lib/youtube";

// Module Diffusion : connecte (ou déconnecte) la chaîne YouTube du podcast. Seules les statistiques
// publiques des vidéos sont lues, il n'y a aucune connexion au compte Google.
async function access(userId: string) {
  try {
    await assertModuleAccess(userId, "diffusion");
    return null;
  } catch (err) {
    if (err instanceof ModuleLockedError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }
}

export async function POST(req: Request) {
  const userId = await requireUserId();
  const podcast = await requirePodcast(userId);
  const locked = await access(userId);
  if (locked) return locked;

  const parsed = z.object({ url: z.string().min(1).max(300) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Colle l'adresse de ta chaîne YouTube." }, { status: 400 });

  try {
    const channel = await resolveChannel(parsed.data.url);
    const updated = await prisma.podcast.update({
      where: { id: podcast.id },
      data: { youtubeChannelId: channel.id, youtubeChannelTitle: channel.title, youtubeUploadsPlaylist: channel.uploadsPlaylist },
    });
    return jsonResponse({ channelTitle: updated.youtubeChannelTitle });
  } catch (err) {
    if (err instanceof YouTubeError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}

export async function DELETE() {
  const userId = await requireUserId();
  const podcast = await requirePodcast(userId);
  await prisma.podcast.update({ where: { id: podcast.id }, data: { youtubeChannelId: null, youtubeChannelTitle: null, youtubeUploadsPlaylist: null } });
  return NextResponse.json({ ok: true });
}
