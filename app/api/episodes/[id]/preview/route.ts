import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";
import { enqueueEpisodePreview } from "@/lib/pipeline/enqueue";
import { previewKeyFor } from "@/lib/pipeline/render";
import { getSignedDownloadUrl, listAllObjects } from "@/lib/storage";

// Étape "Prévisualisation" du tunnel de montage : lance un rendu basse
// définition rapide (mêmes coupes, intro, générique et logo que le rendu
// final). Renvoie l'id du job à suivre (progression et fin via
// GET /api/episodes/[id], champ jobs).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId } = await params;
  const episode = await requireOwnedEpisode(userId, episodeId);

  if (episode.status === "EXPORTED") {
    return NextResponse.json({ error: "Cet épisode a déjà été exporté et ne peut plus être modifié." }, { status: 403 });
  }
  if (episode.status !== "DRAFT") {
    return NextResponse.json({ error: "Le traitement de cet épisode est déjà en cours." }, { status: 409 });
  }
  const readyRushes = await prisma.rushSource.count({ where: { episodeId, selectedForEpisode: true } });
  if (readyRushes === 0) return NextResponse.json({ error: "Sélectionnez au moins un rush." }, { status: 400 });

  const jobId = await enqueueEpisodePreview(episodeId);
  return NextResponse.json({ jobId });
}

// URL de lecture de la dernière prévisualisation, ou null s'il n'y en a pas
// encore (jamais générée, ou nettoyée depuis).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId } = await params;
  await requireOwnedEpisode(userId, episodeId);

  const key = previewKeyFor(episodeId);
  const exists = (await listAllObjects(key)).some((o) => o.key === key);
  return NextResponse.json({ url: exists ? await getSignedDownloadUrl(key) : null });
}
