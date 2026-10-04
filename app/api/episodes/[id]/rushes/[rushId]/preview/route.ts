import { NextResponse } from "next/server";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { prisma } from "@/lib/db";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";
import { getLocalWorkingPath, getLocalPath, putLocalFile, getSignedDownloadUrl, storageMode } from "@/lib/storage";
import { transcodeForWebPreview, isBrowserPlayable } from "@/lib/pipeline/ffmpeg";
import { workDirFor } from "@/lib/pipeline/render";

const PREVIEW_MAX_DURATION_SEC = 90;

// Étape "2. Analyse" : aperçu vidéo d'un rush AVANT tout traitement. Le
// fichier original (souvent HEVC/ProRes en caméra pro, illisible par le
// <video> du navigateur) est transcodé à la demande en H.264/AAC, limité aux
// 90 premières secondes, suffisant pour vérifier le contenu, et bien plus
// rapide qu'un transcodage intégral sur un rush qui peut durer une heure.
// Mis en cache (previewKey) : un aperçu déjà généré n'est jamais reconstruit.
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

  if (rush.previewKey) {
    return NextResponse.json({ url: await getSignedDownloadUrl(rush.previewKey) });
  }

  // Sans télécharger le fichier (plusieurs Go) : ffprobe/ffmpeg lisent l'URL signée
  // et ne tirent que les octets dont ils ont besoin (quelques secondes de vidéo).
  const source = storageMode === "s3" ? await getSignedDownloadUrl(rush.storageKey, 1800) : getLocalPath(rush.storageKey);

  // H.264 + AAC : lisible tel quel par le navigateur, aucun transcodage à attendre.
  const playable = await isBrowserPlayable(source).catch(() => false);
  if (playable) {
    return NextResponse.json({ url: await getSignedDownloadUrl(rush.storageKey), original: true });
  }

  const tmpDir = await mkdtemp(path.join(tmpdir(), "podtool-rush-preview-"));
  try {
    const previewPath = path.join(tmpDir, "preview.mp4");
    try {
      await transcodeForWebPreview(source, previewPath, PREVIEW_MAX_DURATION_SEC);
    } catch (err) {
      // Lecture directe impossible (ffmpeg sans https, fichier atypique) : repli sur le fichier rapatrié.
      console.warn(`[rush-preview] lecture directe impossible pour ${rushId}:`, (err as Error).message);
      const localPath = await getLocalWorkingPath(rush.storageKey, workDirFor(episodeId));
      await transcodeForWebPreview(localPath, previewPath, PREVIEW_MAX_DURATION_SEC);
    }

    // Clé fixe par rush : deux demandes simultanées écrivent au même endroit, sans laisser de fichier perdu.
    const previewKey = `rushes/${episodeId}/${rushId}-preview.mp4`;
    await putLocalFile(previewKey, previewPath, "video/mp4");
    await prisma.rushSource.update({ where: { id: rushId }, data: { previewKey } });

    return NextResponse.json({ url: await getSignedDownloadUrl(previewKey) });
  } catch (err) {
    console.warn(`[rush-preview] échec de la génération pour ${rushId}:`, (err as Error).message);
    return NextResponse.json({ error: "Échec de la génération de l'aperçu." }, { status: 500 });
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}
