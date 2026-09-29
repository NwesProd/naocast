import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";

// Étape 5 du formulaire : passages à couper manuellement, sélectionnés
// directement dans le transcript écrit. Utilisé aussi pendant la relecture
// (étape "validation/relecture" → recoupe manuelle si besoin).
const schema = z.object({ startMs: z.number().int().nonnegative(), endMs: z.number().int().positive() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId } = await params;
  await requireOwnedEpisode(userId, episodeId);

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  if (parsed.data.endMs <= parsed.data.startMs) {
    return NextResponse.json({ error: "La fin doit être après le début." }, { status: 400 });
  }

  const marker = await prisma.cutMarker.create({
    data: { episodeId, source: "MANUAL", ...parsed.data },
  });
  return NextResponse.json(marker);
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId } = await params;
  await requireOwnedEpisode(userId, episodeId);
  const markers = await prisma.cutMarker.findMany({ where: { episodeId }, orderBy: { startMs: "asc" } });
  return NextResponse.json(markers);
}
