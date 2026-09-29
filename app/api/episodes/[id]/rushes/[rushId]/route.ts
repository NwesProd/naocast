import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonResponse } from "@/lib/json";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";
import { deleteObject } from "@/lib/storage";

// Étape 2 du formulaire : analyse du transfert, l'utilisateur choisit quels
// fichiers détectés (thèmes/nombre d'épisodes) traiter pour cet épisode.
const schema = z.object({ selectedForEpisode: z.boolean() });

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; rushId: string }> }
) {
  const userId = await requireUserId();
  const { id: episodeId, rushId } = await params;
  await requireOwnedEpisode(userId, episodeId);

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  const rush = await prisma.rushSource.update({
    where: { id: rushId, episodeId },
    data: { selectedForEpisode: parsed.data.selectedForEpisode },
  });
  return jsonResponse(rush);
}

// Étape "Import" du tunnel : retirer un rush importé par erreur, avant même
// l'étape "Analyse" (contrairement à selectedForEpisode qui ne fait que
// l'exclure du traitement, ceci le supprime pour de bon, fichier stocké
// compris).
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; rushId: string }> }
) {
  const userId = await requireUserId();
  const { id: episodeId, rushId } = await params;
  await requireOwnedEpisode(userId, episodeId);

  const rush = await prisma.rushSource.findFirst({ where: { id: rushId, episodeId } });
  if (!rush) return NextResponse.json({ error: "Rush introuvable." }, { status: 404 });

  await prisma.rushSource.delete({ where: { id: rushId } });
  if (rush.storageKey) {
    await deleteObject(rush.storageKey).catch(() => {
      // Best-effort : la ligne en base est déjà supprimée, un fichier orphelin
      // resté sur le stockage n'est pas bloquant pour l'utilisateur.
    });
  }
  return NextResponse.json({ ok: true });
}
