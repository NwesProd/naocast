import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";
import { clearRenderArtifacts } from "@/lib/pipeline/render";

// Étape "validation/relecture" : après avoir vu le résultat, l'utilisateur
// peut ajouter des découpes manuelles supplémentaires puis redemander un
// rendu, sans refaire la récupération des rushs, la transcription ni
// l'autocut (déjà en base / sur disque).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId } = await params;
  await requireOwnedEpisode(userId, episodeId);

  await clearRenderArtifacts(episodeId);

  // Tous les jobs de l'épisode, pas seulement PENDING/FAILED : sinon les
  // lignes DONE d'un précédent "Relancer le rendu" s'accumulent indéfiniment
  // (un nouveau job RENDER à chaque clic, sans jamais retirer les anciens),
  // affichage confus en relecture (plusieurs "Rendu vidéo" listés, pas dans
  // l'ordre) constaté en conditions réelles.
  await prisma.$transaction([
    prisma.processingJob.deleteMany({ where: { episodeId } }),
    prisma.processingJob.create({ data: { episodeId, type: "RENDER", sequence: 0 } }),
    prisma.episode.update({ where: { id: episodeId }, data: { status: "QUEUED" } }),
  ]);

  return NextResponse.json({ ok: true });
}
