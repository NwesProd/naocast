import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createWriteStream } from "fs";
import { mkdtemp, rm } from "fs/promises";
import { pipeline } from "stream/promises";
import { tmpdir } from "os";
import path from "path";
import { prisma } from "@/lib/db";
import { deleteObject, getSignedDownloadUrl, putLocalFile } from "@/lib/storage";
import { parseMultipart } from "@/lib/parseMultipart";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const FIELD = { cover: "coverKey", thumbnail: "thumbnailKey" } as const;
type Kind = keyof typeof FIELD;

// Miniature d'un épisode : pochette audio (cover) ou miniature vidéo (thumbnail). Un nouvel envoi remplace le précédent.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireUserId();
  let episode;
  try {
    episode = await requireOwnedEpisode(userId, id);
  } catch {
    return NextResponse.json({ error: "Épisode introuvable." }, { status: 404 });
  }

  const tmpDir = await mkdtemp(path.join(tmpdir(), "naocast-miniature-"));
  try {
    let uploaded: { key: string; name: string } | null = null;
    let rejected = false;
    const fields = await parseMultipart(req, async (file) => {
      if (file.fieldName !== "file" || !file.filename || uploaded) {
        file.stream.resume();
        return;
      }
      if (!IMAGE_TYPES.includes(file.mimeType)) {
        rejected = true;
        file.stream.resume();
        return;
      }
      const tmpPath = path.join(tmpDir, "upload");
      await pipeline(file.stream, createWriteStream(tmpPath));
      const ext = file.mimeType === "image/png" ? "png" : file.mimeType === "image/webp" ? "webp" : "jpg";
      const key = `episodes/${id}/miniature/${randomUUID()}-${file.filename.replace(/[^\w.\-]+/g, "_")}.${ext}`;
      await putLocalFile(key, tmpPath, file.mimeType);
      uploaded = { key, name: file.filename };
    });
    const kind = fields.kind as Kind;
    if (!(kind in FIELD)) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
    if (!uploaded) return NextResponse.json({ error: rejected ? "Format non pris en charge : importe une image JPG, PNG ou WebP." : "Aucun fichier reçu." }, { status: 400 });
    const up: { key: string; name: string } = uploaded;

    const previous = episode[FIELD[kind]];
    await prisma.episode.update({ where: { id }, data: { [FIELD[kind]]: up.key } });
    if (previous) await deleteObject(previous).catch(() => {});
    return NextResponse.json({ ok: true, kind, url: await getSignedDownloadUrl(up.key), name: up.name });
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireUserId();
  let episode;
  try {
    episode = await requireOwnedEpisode(userId, id);
  } catch {
    return NextResponse.json({ error: "Épisode introuvable." }, { status: 404 });
  }
  const kind = new URL(req.url).searchParams.get("kind") as Kind;
  if (!(kind in FIELD)) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const previous = episode[FIELD[kind]];
  await prisma.episode.update({ where: { id }, data: { [FIELD[kind]]: null } });
  if (previous) await deleteObject(previous).catch(() => {});
  return NextResponse.json({ ok: true });
}
