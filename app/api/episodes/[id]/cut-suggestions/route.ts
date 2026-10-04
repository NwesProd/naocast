import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";
import { jsonResponse } from "@/lib/json";
import { suggestCuts } from "@/lib/pipeline/cutSuggestions";

// Plusieurs dizaines de secondes pour un épisode long : on laisse de la marge
// avant la coupure de la fonction (hébergeurs serverless).
export const maxDuration = 300;

// Étape "Cut" : l'IA relit le transcript et propose les passages à couper.
// Remplace les propositions précédentes encore en attente (relancer l'analyse
// repart de zéro) ; les coupes déjà acceptées (CutMarker) ne sont pas touchées
// et les passages qu'elles couvrent déjà ne sont pas reproposés.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId } = await params;
  await requireOwnedEpisode(userId, episodeId);

  const segments = await prisma.transcriptSegment.findMany({ where: { episodeId }, orderBy: { startMs: "asc" } });
  if (segments.length === 0) {
    return NextResponse.json({ error: "Générez d'abord le transcript de l'épisode." }, { status: 400 });
  }
  const speakers = await prisma.episodeSpeaker.findMany({ where: { episodeId } });
  const speakerNames: Record<string, string> = {};
  speakers.forEach((sp, i) => {
    speakerNames[sp.label] = sp.displayName || `Locuteur ${i + 1}`;
  });

  let found;
  try {
    found = await suggestCuts(
      segments.map((s) => ({ id: s.id, startMs: s.startMs, endMs: s.endMs, text: s.text, speaker: s.speaker })),
      speakerNames
    );
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }

  const markers = await prisma.cutMarker.findMany({ where: { episodeId } });
  const alreadyCut = (s: { startMs: number; endMs: number }) =>
    markers.some((m) => m.startMs <= s.startMs && m.endMs >= s.endMs);
  const toCreate = found.filter((s) => !alreadyCut(s));

  await prisma.$transaction([
    prisma.cutSuggestion.deleteMany({ where: { episodeId } }),
    prisma.cutSuggestion.createMany({ data: toCreate.map((s) => ({ episodeId, ...s })) }),
  ]);

  const created = await prisma.cutSuggestion.findMany({ where: { episodeId }, orderBy: { startMs: "asc" } });
  return jsonResponse(created);
}
