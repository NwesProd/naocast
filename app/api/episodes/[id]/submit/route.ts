import { NextResponse } from "next/server";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { enqueueEpisodePipeline } from "@/lib/pipeline/enqueue";

// Fin du formulaire d'ajout d'épisode → déclenche le traitement automatique
// (ou bascule vers le montage humain si caméras séparées, cf. enqueue.ts).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId } = await params;
  const episode = await requireOwnedEpisode(userId, episodeId);

  // Monteur naocast. : la demande passe par le paiement (cf. .../editing-request),
  // jamais directement par ici.
  if (episode.editorChoice === "NEED_EDITOR") {
    const paid = await prisma.editingRequest.findFirst({ where: { episodeId, status: "PAID" } });
    if (!paid) return NextResponse.json({ error: "Le paiement de la demande de montage est requis." }, { status: 402 });
  }

  await enqueueEpisodePipeline(episodeId);
  return NextResponse.json({ ok: true });
}
