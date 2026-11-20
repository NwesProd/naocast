import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createWriteStream } from "fs";
import { mkdtemp, rm, stat } from "fs/promises";
import { pipeline } from "stream/promises";
import { tmpdir } from "os";
import path from "path";
import { prisma } from "@/lib/db";
import { deleteObject, getSignedDownloadUrl, putLocalFile } from "@/lib/storage";
import { parseMultipart } from "@/lib/parseMultipart";
import { requireUserId, AuthError } from "@/lib/authz";
import { LOGO_ASSET_ID, MEDIA_ASSET_TYPE_KEYS, previewKind } from "@/lib/mediaAssets";

// Ajoute un média (jingle, transition, son, musique...) à la bibliothèque du podcast.
// Fichier audio, vidéo ou image (logo), passé par un fichier temporaire pour ne pas le charger en mémoire.
export async function POST(req: Request) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "Votre session a expiré, reconnectez-vous." }, { status: 401 });
    throw err;
  }
  const podcast = await prisma.podcast.findUnique({ where: { userId } });
  if (!podcast) return NextResponse.json({ error: "Enregistrez d'abord le titre du podcast." }, { status: 400 });

  const tmpDir = await mkdtemp(path.join(tmpdir(), "naocast-asset-"));
  try {
    let uploaded: { key: string; name: string; mimeType: string; size: number } | null = null;
    const fields = await parseMultipart(req, async (file) => {
      if (file.fieldName !== "file" || !file.filename || uploaded || !previewKind(file.mimeType)) {
        file.stream.resume();
        return;
      }
      const tmpPath = path.join(tmpDir, "upload");
      await pipeline(file.stream, createWriteStream(tmpPath));
      const key = `podcast/assets/${randomUUID()}-${file.filename}`;
      await putLocalFile(key, tmpPath, file.mimeType);
      uploaded = { key, name: file.filename, mimeType: file.mimeType, size: (await stat(tmpPath)).size };
    });

    if (!uploaded) return NextResponse.json({ error: "Format non pris en charge : importe un fichier audio, vidéo ou une image." }, { status: 400 });
    const up: { key: string; name: string; mimeType: string; size: number } = uploaded;
    const type = (MEDIA_ASSET_TYPE_KEYS as string[]).includes(fields.type) ? fields.type : "autre";

    // Le logo permanent (incrusté sur chaque épisode monté) est unique : un nouveau
    // logo remplace l'ancien au lieu de s'ajouter à la liste.
    if (type === "logo") {
      if (previewKind(up.mimeType) !== "image") {
        await deleteObject(up.key).catch(() => {});
        return NextResponse.json({ error: "Le logo doit être une image." }, { status: 400 });
      }
      await prisma.podcast.update({ where: { id: podcast.id }, data: { logoKey: up.key } });
      if (podcast.logoKey) await deleteObject(podcast.logoKey).catch(() => {});
      return NextResponse.json({
        asset: {
          id: LOGO_ASSET_ID,
          name: up.name,
          type: "logo",
          mimeType: up.mimeType,
          size: up.size,
          createdAt: new Date().toISOString(),
          url: await getSignedDownloadUrl(up.key),
          downloadUrl: await getSignedDownloadUrl(up.key, 3600, up.name),
        },
      });
    }

    const asset = await prisma.mediaAsset.create({
      data: { podcastId: podcast.id, name: up.name, type, key: up.key, mimeType: up.mimeType, size: up.size },
    });
    return NextResponse.json({
      asset: {
        id: asset.id,
        name: asset.name,
        type: asset.type,
        mimeType: asset.mimeType,
        size: asset.size,
        createdAt: asset.createdAt.toISOString(),
        url: await getSignedDownloadUrl(asset.key),
        downloadUrl: await getSignedDownloadUrl(asset.key, 3600, asset.name),
      },
    });
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}
