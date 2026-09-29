import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";
import { jsonResponse } from "@/lib/json";
import { suggestIntroHooks } from "@/lib/pipeline/introSuggestions";

// Module "Intro" : demande à l'API Claude les meilleurs passages ("hooks") du
// transcript et les ajoute directement à la séquence du teaser, pré-sélection
// automatique plutôt que de laisser l'utilisateur parcourir tout le
// transcript à la main. Les suggestions déjà présentes (même
// startMs/endMs, ex. un second clic) sont ignorées plutôt que dupliquées.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId } = await params;
  await requireOwnedEpisode(userId, episodeId);

  const transcriptSegments = await prisma.transcriptSegment.findMany({
    where: { episodeId },
    orderBy: { startMs: "asc" },
  });
  if (transcriptSegments.length === 0) {
    return NextResponse.json({ error: "Générez d'abord le transcript de l'épisode." }, { status: 400 });
  }

  let suggestions;
  try {
    suggestions = await suggestIntroHooks(
      transcriptSegments.map((s) => ({
        startMs: s.startMs,
        endMs: s.endMs,
        text: s.text,
        words: s.words as { text: string; startMs: number; endMs: number }[] | null,
      }))
    );
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }

  const existing = await prisma.introSegment.findMany({ where: { episodeId } });
  const existingKeys = new Set(existing.map((s) => `${s.startMs}-${s.endMs}`));
  const toCreate = suggestions.filter((s) => !existingKeys.has(`${s.startMs}-${s.endMs}`));

  if (toCreate.length === 0) {
    return jsonResponse([]);
  }

  const maxOrder = await prisma.introSegment.aggregate({ where: { episodeId }, _max: { order: true } });
  let nextOrder = (maxOrder._max.order ?? -1) + 1;

  const created = await prisma.$transaction(
    toCreate.map((s) =>
      prisma.introSegment.create({
        data: { episodeId, startMs: s.startMs, endMs: s.endMs, text: s.text, order: nextOrder++ },
      })
    )
  );

  return jsonResponse(created);
}
