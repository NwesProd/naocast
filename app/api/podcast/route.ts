import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { putObject, putLocalFile } from "@/lib/storage";
import { parseMultipart } from "@/lib/parseMultipart";
import { requireUserId, AuthError } from "@/lib/authz";
import { transcodeForWebPreview } from "@/lib/pipeline/ffmpeg";
import { randomUUID } from "crypto";
import { mkdtemp, rm } from "fs/promises";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { tmpdir } from "os";
import path from "path";

// Configuration du podcast (une fois, à la création), un seul podcast par
// compte au MVP. Titre, pochette, générique de début/fin, logo permanent
// (incrusté à chaque rendu, cf. lib/pipeline/render.ts).
export async function GET() {
  const userId = await requireUserId();
  const podcast = await prisma.podcast.findUnique({ where: { userId } });
  return NextResponse.json(podcast);
}

const PREFIX_BY_FIELD: Record<string, string> = {
  cover: "podcast/cover",
  intro: "podcast/intro",
  outro: "podcast/outro",
  logo: "podcast/logo",
};

// Champs pour lesquels on génère aussi un aperçu web-compatible (H.264/AAC) :
// le fichier original du générique peut être dans un codec/conteneur que les
// navigateurs ne savent pas décoder (HEVC, ProRes...), contrairement à ffmpeg.
const TRANSCODE_PREVIEW_FIELDS = new Set(["intro", "outro"]);

export async function POST(req: Request) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: "Votre session a expiré, reconnectez-vous." }, { status: 401 });
    }
    throw err;
  }

  const tmpDir = await mkdtemp(path.join(tmpdir(), "podtool-podcast-"));

  try {
    const keys: Record<string, string> = {};
    const previewKeys: Record<string, string> = {};

    const fields = await parseMultipart(req, async (file) => {
      if (!file.filename) {
        // Champ file vide (aucun fichier sélectionné) : un <input type="file">
        // sans fichier est quand même envoyé comme une part multipart par le
        // navigateur (via `new FormData(form)`). Il faut vider son flux, sinon
        // busboy reste bloqué en attente de sa lecture et le parsing entier
        // du formulaire ne se termine jamais.
        file.stream.resume();
        return;
      }
      const prefix = PREFIX_BY_FIELD[file.fieldName];
      if (!prefix) {
        file.stream.resume();
        return;
      }

      const key = `${prefix}/${randomUUID()}-${file.filename}`;

      if (!TRANSCODE_PREVIEW_FIELDS.has(file.fieldName)) {
        // Pochette/logo : petites images, bufferisées en mémoire pour
        // l'upload. Un flux busboy n'expose jamais sa longueur à l'avance,
        // or R2 refuse l'upload "chunked" sans longueur connue.
        const chunks: Buffer[] = [];
        for await (const chunk of file.stream) chunks.push(chunk as Buffer);
        await putObject(key, Buffer.concat(chunks), file.mimeType);
        keys[file.fieldName] = key;
        return;
      }

      // Générique : on passe par un fichier temporaire (nécessaire à ffmpeg),
      // on stocke l'original tel quel, puis on tente un transcodage d'aperçu.
      const tmpPath = path.join(tmpDir, `${file.fieldName}-${file.filename}`);
      await pipeline(file.stream, createWriteStream(tmpPath));
      await putLocalFile(key, tmpPath, file.mimeType);
      keys[file.fieldName] = key;

      try {
        const previewPath = path.join(tmpDir, `${file.fieldName}-preview.mp4`);
        await transcodeForWebPreview(tmpPath, previewPath);
        const previewKey = `${prefix}/${randomUUID()}-preview.mp4`;
        await putLocalFile(previewKey, previewPath, "video/mp4");
        previewKeys[file.fieldName] = previewKey;
      } catch (err) {
        // Best-effort : sans ffmpeg installé (ou en cas d'échec de
        // transcodage), l'original reste utilisable par le pipeline de
        // rendu, seul l'aperçu navigateur ne sera pas disponible.
        console.warn(`[podcast] transcodage d'aperçu indisponible pour ${file.fieldName}:`, (err as Error).message);
      }
    });

    // Le titre vit désormais dans l'onglet "ADN" (cf. POST /api/podcast/dna),
    // pas dans ce formulaire "Graphisme", requis seulement à la toute
    // première configuration (pas encore de podcast, donc pas encore de
    // titre choisi ailleurs).
    const title = (fields.title || "").trim();
    const existingPodcast = await prisma.podcast.findUnique({ where: { userId } });
    if (!existingPodcast && !title) {
      return NextResponse.json({ error: "Configurez d'abord le titre du podcast dans l'onglet ADN." }, { status: 400 });
    }

    const data: {
      title?: string;
      coverKey?: string;
      introKey?: string;
      outroKey?: string;
      logoKey?: string;
      introPreviewKey?: string;
      outroPreviewKey?: string;
    } = {};

    if (title) data.title = title;
    if (keys.cover) data.coverKey = keys.cover;
    if (keys.intro) data.introKey = keys.intro;
    if (keys.outro) data.outroKey = keys.outro;
    if (keys.logo) data.logoKey = keys.logo;
    if (previewKeys.intro) data.introPreviewKey = previewKeys.intro;
    if (previewKeys.outro) data.outroPreviewKey = previewKeys.outro;

    const podcast = await prisma.podcast.upsert({
      where: { userId },
      update: data,
      create: { userId, title, ...data },
    });

    return NextResponse.json(podcast);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

// Suppression définitive du podcast (ADN, bible, graphisme). Les fichiers
// déjà stockés (R2/B2) ne sont pas nettoyés ici : best-effort, pas
// bloquant pour l'utilisateur, à traiter séparément si besoin.
export async function DELETE() {
  const userId = await requireUserId();
  await prisma.podcast.deleteMany({ where: { userId } });
  return NextResponse.json({ ok: true });
}
