import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";
import { resetEpisodeWorkDir } from "@/lib/pipeline/render";

// Bouton "Recommencer le montage à zéro" en relecture : contrairement à
// /retry (qui relance le MÊME pipeline automatique après un échec), celui-ci
// repasse par le tunnel de montage (étapes Cut/Rythme/Générique/Logo...),
// l'utilisateur peut donc revoir ou changer ses choix avant de relancer,
// pas juste réexécuter les mêmes jobs. Les rushs déjà importés et le
// transcript sont conservés (pas besoin de tout ré-uploader), mais les
// découpes, jobs et rendus précédents sont effacés : "à zéro" veut dire à
// zéro sur le résultat du montage, pas sur la matière première.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId } = await params;
  const episode = await requireOwnedEpisode(userId, episodeId);

  // Un épisode exporté est définitivement figé : sans ce verrou, un compte
  // au forfait gratuit (1 épisode) pourrait recommencer indéfiniment le même
  // épisode avec des rushs différents pour contourner la limite.
  if (episode.status === "EXPORTED") {
    return NextResponse.json({ error: "Cet épisode a déjà été exporté et ne peut plus être modifié." }, { status: 403 });
  }

  await resetEpisodeWorkDir(episodeId);
  await prisma.$transaction([
    prisma.cutMarker.deleteMany({ where: { episodeId } }),
    prisma.processingJob.deleteMany({ where: { episodeId } }),
    prisma.exportAsset.deleteMany({ where: { episodeId } }),
    prisma.episode.update({ where: { id: episodeId }, data: { status: "DRAFT" } }),
  ]);

  return NextResponse.json({ ok: true });
}
