import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonResponse } from "@/lib/json";
import { deleteObject } from "@/lib/storage";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";
import { CLIP_STATUS_KEYS, linkPublishedClip, parseYoutubeVideoId } from "@/lib/clips";

async function ownedClip(userId: string, episodeId: string, clipId: string) {
  await requireOwnedEpisode(userId, episodeId);
  return prisma.clip.findFirst({ where: { id: clipId, episodeId } });
}

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  status: z.enum(CLIP_STATUS_KEYS).optional(),
  // Lien du short publié sur YouTube ("" pour le retirer).
  publishedUrl: z.string().max(500).optional(),
  // Description pour la diffusion et date de publication prévue (AAAA-MM-JJ), vides pour effacer : informatives, sans effet sur YouTube.
  description: z.string().max(5000).optional(),
  publishDate: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; clipId: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId, clipId } = await params;
  const clip = await ownedClip(userId, episodeId, clipId);
  if (!clip) return NextResponse.json({ error: "Extrait introuvable." }, { status: 404 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  const data: { title?: string; status?: string; publishedUrl?: string | null; youtubeVideoId?: string | null; description?: string | null; publishDate?: Date | null } = {};
  if (parsed.data.description !== undefined) data.description = parsed.data.description.trim() || null;
  if (parsed.data.publishDate !== undefined) data.publishDate = parsed.data.publishDate ? new Date(`${parsed.data.publishDate}T00:00:00.000Z`) : null;
  if (parsed.data.title) data.title = parsed.data.title;
  if (parsed.data.status) data.status = parsed.data.status;
  if (parsed.data.publishedUrl !== undefined) {
    const url = parsed.data.publishedUrl.trim();
    if (!url) {
      Object.assign(data, { publishedUrl: null, youtubeVideoId: null, status: parsed.data.status ?? (clip.fileKey ? "READY" : "TO_EDIT") });
    } else {
      const videoId = parseYoutubeVideoId(url);
      if (!videoId) return NextResponse.json({ error: "Lien YouTube non reconnu." }, { status: 400 });
      Object.assign(data, { publishedUrl: url, youtubeVideoId: videoId, status: "PUBLISHED" });
      await linkPublishedClip(episodeId, videoId);
    }
  }
  return jsonResponse(await prisma.clip.update({ where: { id: clipId }, data }));
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; clipId: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId, clipId } = await params;
  const clip = await ownedClip(userId, episodeId, clipId);
  if (!clip) return NextResponse.json({ error: "Extrait introuvable." }, { status: 404 });
  await prisma.clip.delete({ where: { id: clipId } });
  if (clip.fileKey) await deleteObject(clip.fileKey).catch(() => {});
  return NextResponse.json({ ok: true });
}
