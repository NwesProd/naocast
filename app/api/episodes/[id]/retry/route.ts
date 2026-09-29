import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";
import { resetEpisodeWorkDir } from "@/lib/pipeline/render";
import { enqueueEpisodePipeline } from "@/lib/pipeline/enqueue";

// Bouton "Relancer le processus" affiché en relecture quand le statut est
// FAILED : repart entièrement à zéro (contrairement à /rerender, qui suppose
// que le corps de l'épisode existe déjà), un échec peut survenir dès la
// toute première étape (récupération des rushs), donc on ne peut pas
// supposer quoi que ce soit de déjà construit.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId } = await params;
  await requireOwnedEpisode(userId, episodeId);

  // Un échec de l'export final (déclenché par /validate, après que le rendu
  // vidéo a déjà été validé) ne concerne que l'extraction audio, le rendu
  // vidéo lui-même est déjà bon, inutile de tout reprendre à zéro (coûteux :
  // ça referait tous les encodages ffmpeg pour rien).
  const failedExport = await prisma.processingJob.findFirst({ where: { episodeId, type: "EXPORT_AUDIO" } });
  if (failedExport) {
    await prisma.$transaction([
      prisma.processingJob.deleteMany({ where: { episodeId, type: "EXPORT_AUDIO" } }),
      prisma.processingJob.create({ data: { episodeId, type: "EXPORT_AUDIO", sequence: failedExport.sequence } }),
      prisma.episode.update({ where: { id: episodeId }, data: { status: "QUEUED" } }),
    ]);
    return NextResponse.json({ ok: true });
  }

  await resetEpisodeWorkDir(episodeId);
  // Tous les jobs, pas seulement PENDING/FAILED/RUNNING : repartir à zéro
  // veut dire à zéro, sinon les lignes DONE d'une tentative précédente
  // s'accumulent au fil des relances (cf. /rerender, même correctif).
  await prisma.processingJob.deleteMany({ where: { episodeId } });
  await enqueueEpisodePipeline(episodeId);

  return NextResponse.json({ ok: true });
}
