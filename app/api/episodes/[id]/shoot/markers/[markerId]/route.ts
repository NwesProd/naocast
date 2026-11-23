import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";

// Supprime un repère posé par erreur.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; markerId: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId, markerId } = await params;
  await requireOwnedEpisode(userId, episodeId);
  await prisma.shootMarker.deleteMany({ where: { id: markerId, episodeId } });
  return NextResponse.json({ ok: true });
}
