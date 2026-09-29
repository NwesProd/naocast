import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";

// Étape 7 du parcours : export final, après validation du rendu en relecture.
// L'export audio n'est déclenché qu'ici (pas pendant le pipeline automatique,
// cf. enqueueEpisodePipeline) : pas d'intérêt à extraire l'audio d'un rendu
// que l'utilisateur n'a pas encore validé et pourrait encore recouper.
//
// Passe par la file de jobs (comme le reste du pipeline) plutôt que d'exécuter
// l'extraction audio en bloquant la requête HTTP : ça permet à la relecture
// d'afficher une vraie progression % (cf. worker/pipeline.ts, extractAudio)
// au lieu d'un simple "Export en cours..." sans retour tant que ça dure.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId } = await params;
  await requireOwnedEpisode(userId, episodeId);

  const maxSeq = await prisma.processingJob.aggregate({ where: { episodeId }, _max: { sequence: true } });
  const sequence = (maxSeq._max.sequence ?? -1) + 1;

  await prisma.$transaction([
    // Repli si une précédente validation a échoué et laissé un job derrière elle.
    prisma.processingJob.deleteMany({ where: { episodeId, type: "EXPORT_AUDIO" } }),
    prisma.processingJob.create({ data: { episodeId, type: "EXPORT_AUDIO", sequence } }),
    prisma.episode.update({ where: { id: episodeId }, data: { status: "QUEUED" } }),
  ]);

  return NextResponse.json({ ok: true });
}
