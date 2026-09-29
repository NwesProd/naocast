import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";
import { jsonResponse } from "@/lib/json";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; segmentId: string }> }
) {
  const userId = await requireUserId();
  const { id: episodeId, segmentId } = await params;
  await requireOwnedEpisode(userId, episodeId);

  await prisma.introSegment.delete({ where: { id: segmentId, episodeId } });
  return NextResponse.json({ ok: true });
}

const patchSchema = z.object({
  removedRanges: z.array(z.object({ startMs: z.number().int().nonnegative(), endMs: z.number().int().positive() })),
});

// Mode "cut" appliqué à un passage du teaser (module "Intro") : retire des
// mots à l'intérieur de la phrase sans retirer tout le passage, cf.
// assembleClipsInOrder pour comment ces sous-plages sont exclues à l'assemblage.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; segmentId: string }> }
) {
  const userId = await requireUserId();
  const { id: episodeId, segmentId } = await params;
  await requireOwnedEpisode(userId, episodeId);

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  const segment = await prisma.introSegment.update({
    where: { id: segmentId, episodeId },
    data: { removedRanges: parsed.data.removedRanges },
  });
  return jsonResponse(segment);
}
