import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";

// Réordonne les passages du teaser "Intro" : le client envoie la liste
// complète des ids dans le nouvel ordre voulu, `order` est réécrit d'après
// leur position dans ce tableau.
const schema = z.object({ orderedIds: z.array(z.string().min(1)).min(1) });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId } = await params;
  await requireOwnedEpisode(userId, episodeId);

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  const existing = await prisma.introSegment.findMany({ where: { episodeId }, select: { id: true } });
  const existingIds = new Set(existing.map((s) => s.id));
  if (parsed.data.orderedIds.some((id) => !existingIds.has(id)) || parsed.data.orderedIds.length !== existingIds.size) {
    return NextResponse.json({ error: "Liste de passages invalide." }, { status: 400 });
  }

  await prisma.$transaction(
    parsed.data.orderedIds.map((id, order) =>
      prisma.introSegment.update({ where: { id, episodeId }, data: { order } })
    )
  );
  return NextResponse.json({ ok: true });
}
