import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@/app/generated/prisma/client";
import { requireUserId, requirePodcast } from "@/lib/authz";
import { jsonResponse } from "@/lib/json";
import { z } from "zod";
import { normalizeTags } from "@/lib/guestRelevance";

const socialLinkSchema = z.object({ platform: z.string().min(1), url: z.string().min(1) });

// Édite un invité du pool, un invité étant partagé entre tous les épisodes
// du podcast (cf. Guest), la modification est visible partout, pas
// seulement sur l'épisode depuis lequel elle a été faite.
const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  mediaName: z.string().max(200).nullable().optional(),
  socialLinks: z.array(socialLinkSchema).optional(),
  tags: z.array(z.string().max(40)).max(30).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ guestId: string }> }) {
  const userId = await requireUserId();
  const podcast = await requirePodcast(userId);
  const { guestId } = await params;

  const existing = await prisma.guest.findUnique({ where: { id: guestId } });
  if (!existing || existing.podcastId !== podcast.id) {
    return NextResponse.json({ error: "Invité introuvable." }, { status: 404 });
  }

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const { name, mediaName, socialLinks, tags } = parsed.data;

  const guest = await prisma.guest.update({
    where: { id: guestId },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(mediaName !== undefined ? { mediaName: mediaName || null } : {}),
      ...(tags !== undefined ? { tags: normalizeTags(tags) } : {}),
      ...(socialLinks !== undefined ? { socialLinks: socialLinks as unknown as Prisma.InputJsonValue } : {}),
    },
  });

  return jsonResponse(guest);
}

// Retire un invité du pool : il disparaît aussi des épisodes auxquels il était rattaché.
export async function DELETE(_req: Request, { params }: { params: Promise<{ guestId: string }> }) {
  const userId = await requireUserId();
  const podcast = await requirePodcast(userId);
  const { guestId } = await params;

  const existing = await prisma.guest.findUnique({ where: { id: guestId } });
  if (!existing || existing.podcastId !== podcast.id) {
    return NextResponse.json({ error: "Invité introuvable." }, { status: 404 });
  }

  await prisma.guest.delete({ where: { id: guestId } });
  return NextResponse.json({ ok: true });
}
