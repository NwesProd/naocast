import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";
import { jsonResponse } from "@/lib/json";
import { z } from "zod";

// Enregistre le message d'info aux invités.
const patchSchema = z.object({ guestMessage: z.string() });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId } = await params;
  await requireOwnedEpisode(userId, episodeId);

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  const episode = await prisma.episode.update({
    where: { id: episodeId },
    data: { guestMessage: parsed.data.guestMessage || null },
  });

  return jsonResponse(episode);
}
