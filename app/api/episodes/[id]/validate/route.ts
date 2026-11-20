import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";
import { cleanupExportedEpisodeFiles } from "@/lib/pipeline/cleanup";

// Valide le montage final : l'épisode devient « Prêt à diffuser » et les fichiers deviennent
// téléchargeables. Les rushs, devenus inutiles, sont supprimés du stockage (comme à la
// validation d'un montage fait hors naocast).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId } = await params;
  const episode = await requireOwnedEpisode(userId, episodeId);

  if (episode.status !== "READY_FOR_REVIEW") {
    return NextResponse.json({ error: "Dépose d'abord l'épisode final et attends la fin de son traitement." }, { status: 409 });
  }
  const hasFinal = (await prisma.exportAsset.count({ where: { episodeId } })) > 0;
  if (!hasFinal) return NextResponse.json({ error: "Aucun fichier final déposé." }, { status: 409 });

  await prisma.episode.update({ where: { id: episodeId }, data: { status: "EXPORTED" } });
  await cleanupExportedEpisodeFiles(episodeId).catch((err) => console.warn(`[validate] nettoyage échoué pour ${episodeId}:`, err));
  return NextResponse.json({ ok: true });
}

// Retire la validation : l'épisode repasse « à relire » (les rushs supprimés ne reviennent pas).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId } = await params;
  const episode = await requireOwnedEpisode(userId, episodeId);
  if (episode.status !== "EXPORTED") return NextResponse.json({ error: "Le montage n'est pas validé." }, { status: 409 });
  await prisma.episode.update({ where: { id: episodeId }, data: { status: "READY_FOR_REVIEW" } });
  return NextResponse.json({ ok: true });
}
