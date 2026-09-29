import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";
import { getSignedDownloadUrl } from "@/lib/storage";

// Étape "2. Analyse" du tunnel : bouton "Aperçu" par rush, signe l'URL à la
// demande plutôt que d'en générer une pour chaque rush au chargement de la
// page (coût de signature évité pour les rushs jamais prévisualisés).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; rushId: string }> }
) {
  const userId = await requireUserId();
  const { id: episodeId, rushId } = await params;
  await requireOwnedEpisode(userId, episodeId);

  const rush = await prisma.rushSource.findUnique({ where: { id: rushId } });
  if (!rush || rush.episodeId !== episodeId || !rush.storageKey) {
    return NextResponse.json({ error: "Aperçu indisponible pour ce rush." }, { status: 404 });
  }

  const url = await getSignedDownloadUrl(rush.storageKey);
  return NextResponse.json({ url });
}
