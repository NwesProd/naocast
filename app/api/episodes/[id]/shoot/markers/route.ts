import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { jsonResponse } from "@/lib/json";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";
import { assertModuleAccess, ModuleLockedError } from "@/lib/entitlements";

// Pose un repère pendant le tournage : le temps écoulé depuis le départ du chrono est calculé ici,
// côté serveur, pour ne pas dépendre de l'horloge de l'appareil.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId } = await params;
  const episode = await requireOwnedEpisode(userId, episodeId);
  try {
    await assertModuleAccess(userId, "tournage");
  } catch (err) {
    if (err instanceof ModuleLockedError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }
  if (!episode.shootStartedAt || episode.shootEndedAt) {
    return NextResponse.json({ error: "Le tournage n'est pas en cours." }, { status: 409 });
  }
  const marker = await prisma.shootMarker.create({
    data: { episodeId, atMs: Math.max(0, Date.now() - episode.shootStartedAt.getTime()) },
  });
  return jsonResponse(marker, { status: 201 });
}
