import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { mkdir, readFile, writeFile, unlink, stat, rename, readdir } from "fs/promises";
import { createReadStream, createWriteStream, existsSync } from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { randomUUID } from "crypto";
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
// charger entièrement en mémoire. `contentLength`, quand connu (fichier déjà
// sur disque, cf. `putLocalFile`), est transmis à S3/R2 : sans lui, le SDK
// ne peut pas signer la requête en "chunked" (non supporté par R2), et
// l'upload reste bloqué indéfiniment côté client.
export async function putObjectStream(
  key: string,
  body: ReadableStream | Readable,
  contentType?: string,
  contentLength?: number
): Promise<void> {
  if (s3 && bucket) {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: toNodeStream(body),
        ContentType: contentType,
        ContentLength: contentLength,
      })
    );
    return;
  }
  const p = localPath(key);
  await mkdir(path.dirname(p), { recursive: true });
  await pipeline(toNodeStream(body), createWriteStream(p));
}

// Upload en streaming d'un flux dont la taille n'est PAS connue à l'avance
// (ex. flux busboy consommé en parallèle de son écriture sur disque, cf.
// app/api/episodes/[id]/rushes/route.ts) : passe par un upload multipart S3
// (`@aws-sdk/lib-storage`), qui bufferise seulement par petits blocs (~5-10
// Mo) au lieu d'exiger la longueur totale comme `putObjectStream`. Pour un
// gros rush vidéo, évite surtout de devoir écrire sur disque PUIS relire ce
// même fichier pour l'envoyer à R2 (deux passages séquentiels sur un fichier
// de plusieurs centaines de Mo, cause probable des 502 observés en
// production sur des uploads lents) : ici l'écriture locale (pour ffprobe) et
// l'envoi à R2 se font en parallèle, sur le même flux entrant.
export async function putObjectStreamUnknownLength(
  key: string,
  body: ReadableStream | Readable,
  contentType?: string
): Promise<void> {
  if (s3 && bucket) {
    const upload = new Upload({
      client: s3,
      params: { Bucket: bucket, Key: key, Body: toNodeStream(body), ContentType: contentType },
    });
    await upload.done();
    return;
  }
  const p = localPath(key);
  await mkdir(path.dirname(p), { recursive: true });
  await pipeline(toNodeStream(body), createWriteStream(p));
}

// Copie un fichier déjà sur disque (résultat ffmpeg, fichier rapatrié
// d'une source externe) vers le stockage, en streaming. Sa taille, connue à
// l'avance (contrairement à un flux d'upload busboy), est transmise à S3/R2.
export async function putLocalFile(key: string, filePath: string, contentType?: string): Promise<void> {
  const { size } = await stat(filePath);
  await putObjectStream(key, createReadStream(filePath), contentType, size);
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
    // Téléchargé sous un nom temporaire puis renommé une fois COMPLET : sans
    // ça, un process interrompu en plein téléchargement (redéploiement,
    // crash, OOM...) laisse un fichier tronqué exactement au chemin attendu
    // (`dest`), et `existsSync(dest)` ci-dessus le fait alors passer pour
    // valide indéfiniment aux tentatives suivantes (constaté en conditions
    // réelles : "moov atom not found" sur un rush, ffprobe/ffmpeg échouant
    // en boucle sur le même fichier corrompu sans jamais le retélécharger).
    // Un renommage (même système de fichiers) est atomique : `dest` n'existe
    // qu'une fois le contenu entièrement écrit, jamais dans un état partiel.
    const tmpDest = `${dest}.download-${randomUUID()}`;
    try {
      await pipeline(toNodeStream(res.Body!.transformToWebStream()), createWriteStream(tmpDest));
      await rename(tmpDest, dest);
    } catch (err) {
      await unlink(tmpDest).catch(() => {});
      throw err;
    }
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

// Liste les objets stockés (clé + poids), tous ou sous un préfixe : sert aux
// statistiques de stockage du back office et au balayage des fichiers d'un
// épisode. Paginé côté S3/R2 (1000 objets par appel) ; en stockage local
// (dev), parcourt le dossier .data/storage.
export async function listAllObjects(prefix = ""): Promise<{ key: string; size: number }[]> {
  const result: { key: string; size: number }[] = [];

  if (s3 && bucket) {
    let token: string | undefined;
    do {
      const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix || undefined, ContinuationToken: token }));
      for (const obj of page.Contents ?? []) {
        if (obj.Key) result.push({ key: obj.Key, size: obj.Size ?? 0 });
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return result;
  }

  async function walk(dir: string, prefix: string) {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const key = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(full, key);
      else result.push({ key, size: (await stat(full)).size });
    }
  }
  await walk(localRoot, "");
  return prefix ? result.filter((o) => o.key.startsWith(prefix)) : result;
}

// Supprime tous les objets sous un préfixe (ex. "rushes/{épisode}/"), sauf
// ceux de `keep`. Plus sûr que de ne supprimer que les clés connues en base :
// rattrape aussi les fichiers qu'aucune ligne ne référence (upload interrompu,
// fichier remplacé...). Renvoie le nombre d'objets supprimés. Le préfixe doit
// se terminer par "/" pour ne jamais toucher un dossier voisin.
export async function deleteObjectsByPrefix(prefix: string, keep: ReadonlySet<string> = new Set()): Promise<number> {
  if (!prefix.endsWith("/")) throw new Error(`Préfixe de stockage invalide : ${prefix}`);
  const objects = (await listAllObjects(prefix)).filter((o) => !keep.has(o.key));
  for (let i = 0; i < objects.length; i += 10) {
    await Promise.all(objects.slice(i, i + 10).map((o) => deleteObject(o.key).catch(() => {})));
  }
  return objects.length;
}

export async function getSignedDownloadUrl(key: string, expiresInSec = 3600): Promise<string> {
  if (s3 && bucket) {
    return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: expiresInSec });
  }
  // Servi en dev via la route /api/storage/[...key]
  return `/api/storage/${key}`;
}

export const storageMode: "s3" | "local" = s3 && bucket ? "s3" : "local";
