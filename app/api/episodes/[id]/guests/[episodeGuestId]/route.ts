import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";

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
