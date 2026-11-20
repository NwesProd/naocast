import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";
import { jsonResponse } from "@/lib/json";

// "Message diffusion" du module Invités : annonce de la sortie de l'épisode aux
// invités et consignes pour le relayer. Même fonctionnement que guest-message.
const patchSchema = z.object({ guestBroadcastMessage: z.string() });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId } = await params;
  await requireOwnedEpisode(userId, episodeId);

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  const episode = await prisma.episode.update({
    where: { id: episodeId },
    data: { guestBroadcastMessage: parsed.data.guestBroadcastMessage || null },
  });
  return jsonResponse(episode);
}
