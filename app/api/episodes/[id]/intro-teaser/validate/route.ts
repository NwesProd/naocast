import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";
import { jsonResponse } from "@/lib/json";

// Module "Intro" : marque le teaser construit comme définitif, sans cette
// validation explicite, un brouillon jamais confirmé n'est jamais utilisé
// dans le rendu final (cf. Episode.introTeaserValidated, lib/pipeline/render.ts).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId } = await params;
  await requireOwnedEpisode(userId, episodeId);

  const existing = await prisma.episode.findUniqueOrThrow({ where: { id: episodeId } });
  if (!existing.introTeaserKey) {
    return NextResponse.json({ error: "Aucun teaser construit pour l'instant." }, { status: 400 });
  }

  const episode = await prisma.episode.update({
    where: { id: episodeId },
    data: { introTeaserValidated: true, introTeaserChoice: "MODULE" },
  });
  return jsonResponse(episode);
}
