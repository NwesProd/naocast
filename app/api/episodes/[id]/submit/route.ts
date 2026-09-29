import { NextResponse } from "next/server";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";
import { enqueueEpisodePipeline } from "@/lib/pipeline/enqueue";

// Fin du formulaire d'ajout d'épisode → déclenche le traitement automatique
// (ou bascule vers le montage humain si caméras séparées, cf. enqueue.ts).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId } = await params;
  await requireOwnedEpisode(userId, episodeId);

  await enqueueEpisodePipeline(episodeId);
  return NextResponse.json({ ok: true });
}
