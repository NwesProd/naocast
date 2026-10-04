import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";
import { jsonResponse } from "@/lib/json";

// Ajoute un locuteur à la main (étape "Cut") : utile quand la reconnaissance
// automatique des voix n'a rien détecté. Son label technique est généré, seul
// le nom affiché compte pour l'utilisateur.
const postSchema = z.object({ displayName: z.string().max(100).nullable().optional() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId } = await params;
  await requireOwnedEpisode(userId, episodeId);

  const parsed = postSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  const existing = await prisma.episodeSpeaker.findMany({ where: { episodeId }, select: { label: true } });
  const used = new Set(existing.map((s) => s.label));
  let n = existing.length;
  while (used.has(`SPEAKER_${String(n).padStart(2, "0")}`)) n++;

  const speaker = await prisma.episodeSpeaker.create({
    data: { episodeId, label: `SPEAKER_${String(n).padStart(2, "0")}`, displayName: parsed.data.displayName || null },
  });
  return jsonResponse(speaker);
}
