import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createWriteStream } from "fs";
import { mkdtemp, rm } from "fs/promises";
import { pipeline } from "stream/promises";
import { tmpdir } from "os";
import path from "path";
import { prisma } from "@/lib/db";
import { jsonResponse } from "@/lib/json";
import { deleteObject, putLocalFile } from "@/lib/storage";
import { parseMultipart } from "@/lib/parseMultipart";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";

// Dépôt (facultatif) du short monté : une vidéo, qui remplace la précédente. L'extrait passe « Prêt » s'il n'était
// pas déjà publié.
export async function POST(req: Request, { params }: { params: Promise<{ id: string; clipId: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId, clipId } = await params;
  await requireOwnedEpisode(userId, episodeId);
  const clip = await prisma.clip.findFirst({ where: { id: clipId, episodeId } });
  if (!clip) return NextResponse.json({ error: "Extrait introuvable." }, { status: 404 });

  const tmpDir = await mkdtemp(path.join(tmpdir(), "naocast-clip-"));
  try {
    let uploaded: { key: string; name: string } | null = null;
    await parseMultipart(req, async (file) => {
      if (file.fieldName !== "file" || !file.filename || uploaded || !file.mimeType.startsWith("video/")) {
        file.stream.resume();
        return;
      }
      const tmpPath = path.join(tmpDir, "upload");
      await pipeline(file.stream, createWriteStream(tmpPath));
      const key = `episodes/${episodeId}/clips/${randomUUID()}-${file.filename.replace(/[\\/]/g, "_")}`;
      await putLocalFile(key, tmpPath, file.mimeType);
      uploaded = { key, name: file.filename };
    });
    if (!uploaded) return NextResponse.json({ error: "Dépose une vidéo." }, { status: 400 });
    const up: { key: string; name: string } = uploaded;
    const updated = await prisma.clip.update({
      where: { id: clipId },
      data: { fileKey: up.key, fileName: up.name, ...(clip.status !== "PUBLISHED" ? { status: "READY" } : {}) },
    });
    if (clip.fileKey) await deleteObject(clip.fileKey).catch(() => {});
    return jsonResponse(updated);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; clipId: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId, clipId } = await params;
  await requireOwnedEpisode(userId, episodeId);
  const clip = await prisma.clip.findFirst({ where: { id: clipId, episodeId } });
  if (!clip) return NextResponse.json({ error: "Extrait introuvable." }, { status: 404 });
  if (clip.fileKey) await deleteObject(clip.fileKey).catch(() => {});
  await prisma.clip.update({
    where: { id: clipId },
    data: { fileKey: null, fileName: null, ...(clip.status === "READY" ? { status: "TO_EDIT" } : {}) },
  });
  return NextResponse.json({ ok: true });
}
