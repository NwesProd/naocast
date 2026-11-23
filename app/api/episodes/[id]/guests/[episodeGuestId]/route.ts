import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";
import { z } from "zod";

// Coche ou décoche « prévenu » pour un invité de CET épisode (module Tournage).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; episodeGuestId: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId, episodeGuestId } = await params;
  await requireOwnedEpisode(userId, episodeId);
  const parsed = z.object({ notified: z.boolean() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const updated = await prisma.episodeGuest.updateMany({ where: { id: episodeGuestId, episodeId }, data: { notified: parsed.data.notified } });
  if (updated.count === 0) return NextResponse.json({ error: "Introuvable." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

// Détache un invité de CET épisode uniquement, l'invité reste dans le pool
// du podcast (cf. Guest), disponible pour d'autres épisodes.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; episodeGuestId: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId } = await params;
  await requireOwnedEpisode(userId, episodeId);
  const { episodeGuestId } = await params;

  const episodeGuest = await prisma.episodeGuest.findUnique({ where: { id: episodeGuestId } });
  if (!episodeGuest || episodeGuest.episodeId !== episodeId) {
    return NextResponse.json({ error: "Introuvable." }, { status: 404 });
  }

  await prisma.episodeGuest.delete({ where: { id: episodeGuestId } });
  return new NextResponse(null, { status: 204 });
}
