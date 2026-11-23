import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonResponse } from "@/lib/json";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";
import { assertModuleAccess, ModuleLockedError } from "@/lib/entitlements";

// Module Extraits : crée un extrait (un passage du transcript) au statut « Idée ».
const bodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(1),
  excerpt: z.string().max(5000),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId } = await params;
  await requireOwnedEpisode(userId, episodeId);
  try {
    await assertModuleAccess(userId, "extraits");
  } catch (err) {
    if (err instanceof ModuleLockedError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || parsed.data.endMs <= parsed.data.startMs) return NextResponse.json({ error: "Passage invalide." }, { status: 400 });

  const clip = await prisma.clip.create({ data: { episodeId, ...parsed.data } });
  return jsonResponse(clip, { status: 201 });
}
