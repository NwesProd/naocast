import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createWriteStream } from "fs";
import { mkdtemp, rm } from "fs/promises";
import { pipeline } from "stream/promises";
import { tmpdir } from "os";
import path from "path";
import { z } from "zod";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";
import { parseMultipart } from "@/lib/parseMultipart";
import {
  storageMode,
  createDirectUpload,
  getDirectUploadPartUrl,
  completeDirectUpload,
  abortDirectUpload,
  listAllObjects,
  putLocalFile,
} from "@/lib/storage";
import { registerFinalVideo } from "@/lib/finalDelivery";

// Dépôt de la vidéo finale de l'épisode, montée ailleurs : par le monteur, par Claude ou
// par l'utilisateur lui-même. Envoi direct vers R2 par blocs (comme pour les rushs, cf.
// rushes/direct) ; en stockage local (dev), repli sur un envoi multipart via le serveur.
const PART_SIZE = 32 * 1024 * 1024;

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("init"), filename: z.string().min(1).max(300), contentType: z.string().max(200).optional() }),
  z.object({ action: z.literal("part-url"), key: z.string(), uploadId: z.string(), partNumber: z.number().int().min(1).max(10000) }),
  z.object({
    action: z.literal("complete"),
    key: z.string(),
    uploadId: z.string(),
    parts: z.array(z.object({ partNumber: z.number().int().min(1), etag: z.string().min(1) })).min(1),
  }),
  z.object({ action: z.literal("abort"), key: z.string(), uploadId: z.string() }),
]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId } = await params;
  const episode = await requireOwnedEpisode(userId, episodeId);

  if (episode.status === "EXPORTED") {
    return NextResponse.json({ error: "Le montage est validé : retire d'abord la validation pour déposer un nouveau fichier." }, { status: 403 });
  }

  // Repli sans envoi direct : multipart classique via le serveur (stockage local).
  if ((req.headers.get("content-type") || "").startsWith("multipart/")) {
    const tmpDir = await mkdtemp(path.join(tmpdir(), "naocast-final-"));
    try {
      let key: string | null = null;
      await parseMultipart(req, async (file) => {
        if (file.fieldName !== "file" || !file.filename || key) {
          file.stream.resume();
          return;
        }
        const tmpPath = path.join(tmpDir, "upload");
        await pipeline(file.stream, createWriteStream(tmpPath));
        key = `episodes/${episodeId}/final/${randomUUID()}-${file.filename.replace(/[\\/]/g, "_")}`;
        await putLocalFile(key, tmpPath, file.mimeType);
      });
      if (!key) return NextResponse.json({ error: "Fichier manquant." }, { status: 400 });
      await registerFinalVideo(episodeId, key);
      return NextResponse.json({ ok: true });
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const body = parsed.data;

  if (storageMode !== "s3") return NextResponse.json({ direct: false });

  if (body.action === "init") {
    const key = `episodes/${episodeId}/final/${randomUUID()}-${body.filename.replace(/[\\/]/g, "_")}`;
    const uploadId = await createDirectUpload(key, body.contentType);
    return NextResponse.json({ direct: true, key, uploadId, partSize: PART_SIZE });
  }

  if (!body.key.startsWith(`episodes/${episodeId}/final/`)) {
    return NextResponse.json({ error: "Clé de fichier invalide." }, { status: 400 });
  }
  if (body.action === "part-url") {
    return NextResponse.json({ url: await getDirectUploadPartUrl(body.key, body.uploadId, body.partNumber) });
  }
  if (body.action === "abort") {
    await abortDirectUpload(body.key, body.uploadId);
    return NextResponse.json({ ok: true });
  }

  try {
    await completeDirectUpload(body.key, body.uploadId, body.parts);
  } catch (err) {
    await abortDirectUpload(body.key, body.uploadId).catch(() => {});
    console.error("[final] finalisation impossible:", (err as Error).message);
    return NextResponse.json({ error: "Le fichier n'a pas pu être finalisé, réessaie." }, { status: 502 });
  }
  if (!(await listAllObjects(body.key)).some((o) => o.key === body.key)) {
    return NextResponse.json({ error: "Fichier introuvable après l'envoi, réessaie." }, { status: 502 });
  }
  await registerFinalVideo(episodeId, body.key);
  return NextResponse.json({ ok: true });
}
