import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createWriteStream } from "fs";
import { mkdtemp, rm } from "fs/promises";
import { pipeline } from "stream/promises";
import { tmpdir } from "os";
import path from "path";
import { prisma } from "@/lib/db";
import { deleteObject, getSignedDownloadUrl, putLocalFile, putObject } from "@/lib/storage";
import { optimizeCover } from "@/lib/image";
import { readFile } from "fs/promises";
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
    let received: { tmpPath: string; mimeType: string; filename: string } | null = null;
    let rejected = false;
    const fields = await parseMultipart(req, async (file) => {
      if (file.fieldName !== "file" || !file.filename || received) {
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
      received = { tmpPath, mimeType: file.mimeType, filename: file.filename };
    });
    const kind = fields.kind as Kind;
    if (!(kind in FIELD)) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
    if (!received) return NextResponse.json({ error: rejected ? "Format non pris en charge : importe une image JPG, PNG ou WebP." : "Aucun fichier reçu." }, { status: 400 });
    const rec: { tmpPath: string; mimeType: string; filename: string } = received;

    const base = `episodes/${id}/miniature/${randomUUID()}-${rec.filename.replace(/\.[^.]+$/, "").replace(/[^\w.\-]+/g, "_")}`;
    let key: string;
    if (kind === "cover") {
      // La pochette audio est ramenée à environ 1 Mo si elle est plus lourde (cf. lib/image.ts).
      const img = await optimizeCover(await readFile(rec.tmpPath), rec.mimeType);
      key = `${base}.${img.ext}`;
      await putObject(key, img.buffer, img.mimeType);
    } else {
      const ext = rec.mimeType === "image/png" ? "png" : rec.mimeType === "image/webp" ? "webp" : "jpg";
      key = `${base}.${ext}`;
      await putLocalFile(key, rec.tmpPath, rec.mimeType);
    }
    const up = { key, name: rec.filename };

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
