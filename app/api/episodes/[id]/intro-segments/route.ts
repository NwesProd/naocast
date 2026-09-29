import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";

// Module "Intro" : passages du transcript ajoutés au teaser, dans l'ordre
// choisi par l'utilisateur (`order`), indépendant de leur ordre chronologique
// d'origine dans l'épisode. Chaque ajout se place en fin de séquence.
const schema = z.object({
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  text: z.string(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId } = await params;
  await requireOwnedEpisode(userId, episodeId);

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  if (parsed.data.endMs <= parsed.data.startMs) {
    return NextResponse.json({ error: "La fin doit être après le début." }, { status: 400 });
  }

  const maxOrder = await prisma.introSegment.aggregate({ where: { episodeId }, _max: { order: true } });
  const segment = await prisma.introSegment.create({
    data: { episodeId, order: (maxOrder._max.order ?? -1) + 1, ...parsed.data },
  });
  return NextResponse.json(segment);
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId } = await params;
  await requireOwnedEpisode(userId, episodeId);
  const segments = await prisma.introSegment.findMany({ where: { episodeId }, orderBy: { order: "asc" } });
  return NextResponse.json(segments);
}
