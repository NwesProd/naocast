import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";
import { segmentsToReassign } from "@/lib/speakerAssign";

// Attribue un locuteur à une prise de parole du transcript (et aux suivantes,
// jusqu'au prochain changement, cf. lib/speakerAssign.ts). `label: null` retire
// l'attribution.
const bodySchema = z.object({ segmentId: z.string(), label: z.string().nullable() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId } = await params;
  await requireOwnedEpisode(userId, episodeId);

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const { segmentId, label } = parsed.data;

  if (label !== null) {
    const speaker = await prisma.episodeSpeaker.findFirst({ where: { episodeId, label } });
    if (!speaker) return NextResponse.json({ error: "Locuteur introuvable." }, { status: 404 });
  }

  const segments = await prisma.transcriptSegment.findMany({
    where: { episodeId },
    orderBy: { startMs: "asc" },
    select: { id: true, speaker: true },
  });
  const ids = segmentsToReassign(segments, segmentId);
  if (ids.length === 0) return NextResponse.json({ error: "Passage introuvable." }, { status: 404 });

  await prisma.transcriptSegment.updateMany({ where: { episodeId, id: { in: ids } }, data: { speaker: label } });
  return NextResponse.json({ updated: ids.length });
}
