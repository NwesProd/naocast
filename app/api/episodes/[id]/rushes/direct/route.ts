import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonResponse } from "@/lib/json";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";
import {
  storageMode,
  createDirectUpload,
  getDirectUploadPartUrl,
  completeDirectUpload,
  abortDirectUpload,
  getSignedDownloadUrl,
  listAllObjects,
  deleteObject,
} from "@/lib/storage";
import { getDurationSec } from "@/lib/pipeline/ffmpeg";

// Envoi direct d'un rush du navigateur vers R2 (multipart, URLs signées par
// bloc) : le fichier ne transite plus par le serveur web, ce qui évite les 502
// du proxy Railway sur les gros fichiers (cf. ../route.ts pour l'upload
// classique, gardé en repli et en stockage local).

const PART_SIZE = 32 * 1024 * 1024;

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("init"), filename: z.string().min(1).max(300), contentType: z.string().max(200).optional() }),
  z.object({ action: z.literal("part-url"), key: z.string(), uploadId: z.string(), partNumber: z.number().int().min(1).max(10000) }),
  z.object({
    action: z.literal("complete"),
    key: z.string(),
    uploadId: z.string(),
    filename: z.string().min(1).max(300),
    parts: z.array(z.object({ partNumber: z.number().int().min(1), etag: z.string().min(1) })).min(1),
  }),
  z.object({ action: z.literal("abort"), key: z.string(), uploadId: z.string() }),
]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId } = await params;
  const episode = await requireOwnedEpisode(userId, episodeId);

  if (episode.status === "EXPORTED") {
    return NextResponse.json({ error: "Cet épisode a déjà été exporté et ne peut plus être modifié." }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const body = parsed.data;

  // En stockage local (dev), pas d'envoi direct : le client retombe sur l'upload serveur.
  if (storageMode !== "s3") return NextResponse.json({ direct: false });

  if (body.action === "init") {
    const safeName = body.filename.replace(/[\\/]/g, "_");
    const key = `rushes/${episodeId}/${randomUUID()}-${safeName}`;
    const uploadId = await createDirectUpload(key, body.contentType);
    return NextResponse.json({ direct: true, key, uploadId, partSize: PART_SIZE });
  }

  // Toute clé fournie par le client doit rester dans le dossier de CET épisode.
  if (!body.key.startsWith(`rushes/${episodeId}/`)) {
    return NextResponse.json({ error: "Clé de fichier invalide." }, { status: 400 });
  }

  if (body.action === "part-url") {
    const url = await getDirectUploadPartUrl(body.key, body.uploadId, body.partNumber);
    return NextResponse.json({ url });
  }

  if (body.action === "abort") {
    await abortDirectUpload(body.key, body.uploadId);
    return NextResponse.json({ ok: true });
  }

  try {
    await completeDirectUpload(body.key, body.uploadId, body.parts);
  } catch (err) {
    await abortDirectUpload(body.key, body.uploadId);
    console.error("[rushes/direct] finalisation impossible:", (err as Error).message);
    return NextResponse.json({ error: "Le fichier n'a pas pu être finalisé, réessayez." }, { status: 502 });
  }

  const stored = (await listAllObjects(body.key)).find((o) => o.key === body.key);
  if (!stored) return NextResponse.json({ error: "Fichier introuvable après l'envoi, réessayez." }, { status: 502 });

  // Durée (ffprobe lit l'URL signée sans télécharger tout le fichier) : au mieux, jamais bloquant.
  let durationSec: number | null = null;
  try {
    const url = await getSignedDownloadUrl(body.key, 600);
    const d = await Promise.race([
      getDurationSec(url),
      new Promise<number>((_, reject) => setTimeout(() => reject(new Error("délai dépassé")), 45_000)),
    ]);
    durationSec = Number.isFinite(d) ? d : null;
  } catch (err) {
    console.warn(`[rushes/direct] durée indisponible pour ${body.filename}:`, (err as Error).message);
  }

  try {
    const rush = await prisma.rushSource.create({
      data: {
        episodeId,
        type: "UPLOAD",
        status: "READY",
        originalFilename: body.filename,
        storageKey: body.key,
        durationSec,
        fileSizeBytes: BigInt(stored.size),
      },
    });
    return jsonResponse(rush);
  } catch (err) {
    await deleteObject(body.key).catch(() => {});
    throw err;
  }
}
