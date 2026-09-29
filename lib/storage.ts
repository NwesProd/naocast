import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { mkdir, readFile, writeFile, unlink } from "fs/promises";
import { createReadStream, createWriteStream, existsSync } from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import path from "path";

// Abstraction de stockage objet : Cloudflare R2 / Backblaze B2 (compatibles S3) en
// production, repli sur le système de fichiers local en dev quand STORAGE_BUCKET
// n'est pas configuré, permet de développer le pipeline sans compte cloud.
//
// Les fichiers manipulés ici (rushs, rendus, génériques) peuvent peser
// plusieurs centaines de Mo : tout passe par des streams, jamais par un
// Buffer complet en mémoire, sous peine de requêtes très lentes/gourmandes.

const bucket = process.env.STORAGE_BUCKET;
const localRoot = path.join(process.cwd(), ".data", "storage");

const s3 = bucket
  ? new S3Client({
      region: process.env.STORAGE_REGION || "auto",
      endpoint: process.env.STORAGE_ENDPOINT,
      credentials: {
        accessKeyId: process.env.STORAGE_ACCESS_KEY_ID!,
        secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY!,
      },
      // Le SDK v3 calcule par défaut un checksum CRC32 pour chaque requête, ce
      // qui force un encodage "aws-chunked" nécessitant de connaître la
      // longueur du flux à l'avance, un flux busboy (upload multipart) ne
      // l'expose jamais, d'où un crash `x-amz-decoded-content-length`
      // "undefined" constaté en conditions réelles sur R2. "WHEN_REQUIRED"
      // désactive ce calcul par défaut, R2 n'en a pas besoin.
      requestChecksumCalculation: "WHEN_REQUIRED",
    })
  : null;

function localPath(key: string) {
  return path.join(localRoot, key);
}

// Utilisé par app/api/storage/[...key]/route.ts pour streamer un fichier
// local (avec support des Range requests, nécessaire pour la lecture vidéo).
// N'a de sens qu'en storageMode "local", en mode S3, cette route n'est pas
// utilisée (getSignedDownloadUrl renvoie directement une URL R2/B2).
export function getLocalPath(key: string): string {
  return localPath(key);
}

function toNodeStream(body: ReadableStream | Readable): Readable {
  return body instanceof Readable ? body : Readable.fromWeb(body as import("stream/web").ReadableStream);
}

// Écrit un fichier (upload direct, rendu ffmpeg, etc.) en streaming, sans le
// charger entièrement en mémoire.
export async function putObjectStream(
  key: string,
  body: ReadableStream | Readable,
  contentType?: string
): Promise<void> {
  if (s3 && bucket) {
    await s3.send(
      new PutObjectCommand({ Bucket: bucket, Key: key, Body: toNodeStream(body), ContentType: contentType })
    );
    return;
  }
  const p = localPath(key);
  await mkdir(path.dirname(p), { recursive: true });
  await pipeline(toNodeStream(body), createWriteStream(p));
}

// Copie un fichier déjà sur disque (résultat ffmpeg, fichier rapatrié
// d'une source externe) vers le stockage, en streaming.
export async function putLocalFile(key: string, filePath: string, contentType?: string): Promise<void> {
  await putObjectStream(key, createReadStream(filePath), contentType);
}

// Pour les tout petits fichiers (config JSON, etc.) où un Buffer en mémoire
// ne pose pas de problème. Ne pas utiliser pour des rushs/rendus vidéo.
export async function putObject(key: string, body: Buffer, contentType?: string): Promise<void> {
  if (s3 && bucket) {
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
    return;
  }
  const p = localPath(key);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, body);
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  if (s3 && bucket) {
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const bytes = await res.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }
  return readFile(localPath(key));
}

// Chemin sur disque local utilisable directement par ffmpeg. En mode S3, le
// fichier est d'abord rapatrié en streaming dans un répertoire de travail temporaire.
export async function getLocalWorkingPath(key: string, workDir: string): Promise<string> {
  if (!s3 || !bucket) return localPath(key);
  const dest = path.join(workDir, path.basename(key));
  if (!existsSync(dest)) {
    await mkdir(path.dirname(dest), { recursive: true });
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    await pipeline(toNodeStream(res.Body!.transformToWebStream()), createWriteStream(dest));
  }
  return dest;
}

export async function deleteObject(key: string): Promise<void> {
  if (s3 && bucket) {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    return;
  }
  const p = localPath(key);
  if (existsSync(p)) await unlink(p);
}

export async function getSignedDownloadUrl(key: string, expiresInSec = 3600): Promise<string> {
  if (s3 && bucket) {
    return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: expiresInSec });
  }
  // Servi en dev via la route /api/storage/[...key]
  return `/api/storage/${key}`;
}

export const storageMode: "s3" | "local" = s3 && bucket ? "s3" : "local";
