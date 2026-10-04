import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/adminApi";
import { deleteObject } from "@/lib/storage";
import { getStorageReport, invalidateStorageReport } from "@/lib/storageStats";
import { purgeEpisodeRushes } from "@/lib/pipeline/cleanup";

// Libère le stockage d'un utilisateur : supprime ses fichiers inutiles (rushs d'un
// épisode dont le montage est validé, fichiers qu'aucune ligne de la base ne référence).
// La liste est recalculée ici à partir du contenu réel du bucket, jamais fournie par le client.
export const POST = withAdmin<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const { id } = await params;
  invalidateStorageReport();
  const report = await getStorageReport();
  const useless = (report.byUser.get(id)?.list ?? []).filter((f) => f.state !== "used");
  if (useless.length === 0) return NextResponse.json({ deletedFiles: 0, freedBytes: 0 });

  // Rushs devenus inutiles : on supprime aussi leurs lignes (sinon l'épisode référencerait des fichiers absents).
  const staleEpisodes = new Set(useless.filter((f) => f.state === "stale" && f.kind.startsWith("rush") && f.episodeId).map((f) => f.episodeId as string));
  for (const episodeId of staleEpisodes) await purgeEpisodeRushes(episodeId);

  let deletedFiles = 0;
  let freedBytes = 0;
  for (const f of useless) {
    // Les rushs "stale" viennent d'être supprimés avec leur dossier : deleteObject est sans effet sur une clé absente.
    await deleteObject(f.key).catch(() => {});
    deletedFiles += 1;
    freedBytes += f.size;
  }
  invalidateStorageReport();
  return NextResponse.json({ deletedFiles, freedBytes });
});
