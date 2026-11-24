import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";

const schema = z.object({ module: z.enum(["extraits", "diffusion", "miniature"]), done: z.boolean() });

// Valide (ou retire la validation de) un module à la main : Extraits, Diffusion et Miniature.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId } = await params;
  await requireOwnedEpisode(userId, episodeId);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const { module, done } = parsed.data;
  await prisma.episode.update({ where: { id: episodeId }, data: module === "extraits" ? { extraitsValidated: done } : module === "diffusion" ? { diffusionValidated: done } : { miniatureValidated: done } });
  return NextResponse.json({ ok: true });
}
