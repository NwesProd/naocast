import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";
import { jsonResponse } from "@/lib/json";

const schema = z.object({ action: z.enum(["accept", "reject"]) });

// Accepter une proposition de coupe en fait une vraie coupe (CutMarker, comme
// une sélection manuelle) ; la refuser la supprime. Dans les deux cas la
// proposition disparaît de la liste.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; suggestionId: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId, suggestionId } = await params;
  await requireOwnedEpisode(userId, episodeId);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  const suggestion = await prisma.cutSuggestion.findFirst({ where: { id: suggestionId, episodeId } });
  if (!suggestion) return NextResponse.json({ error: "Proposition introuvable." }, { status: 404 });

  if (parsed.data.action === "reject") {
    await prisma.cutSuggestion.delete({ where: { id: suggestionId } });
    return NextResponse.json({ ok: true });
  }

  const [marker] = await prisma.$transaction([
    prisma.cutMarker.create({
      data: { episodeId, source: "MANUAL", startMs: suggestion.startMs, endMs: suggestion.endMs },
    }),
    prisma.cutSuggestion.delete({ where: { id: suggestionId } }),
  ]);
  return jsonResponse(marker);
}
