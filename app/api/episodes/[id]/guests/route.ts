import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";
import { jsonResponse } from "@/lib/json";
import { z } from "zod";

// Rattache un invité déjà existant du pool (cf. /api/podcast/guests) à cet
// épisode, la création de l'invité lui-même se fait via POST
// /api/podcast/guests (avec ou sans episodeId), pas ici.
const bodySchema = z.object({ guestId: z.string().min(1) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId } = await params;
  const episode = await requireOwnedEpisode(userId, episodeId);

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const { guestId } = parsed.data;

  const guest = await prisma.guest.findUnique({ where: { id: guestId } });
  if (!guest || guest.podcastId !== episode.podcastId) {
    return NextResponse.json({ error: "Invité introuvable." }, { status: 404 });
  }

  const already = await prisma.episodeGuest.findUnique({
    where: { episodeId_guestId: { episodeId, guestId } },
  });
  if (already) return jsonResponse({ ...already, guest });

  const maxOrder = await prisma.episodeGuest.aggregate({ where: { episodeId }, _max: { order: true } });
  const episodeGuest = await prisma.episodeGuest.create({
    data: { episodeId, guestId, order: (maxOrder._max.order ?? -1) + 1 },
  });

  return jsonResponse({ ...episodeGuest, guest }, { status: 201 });
}
