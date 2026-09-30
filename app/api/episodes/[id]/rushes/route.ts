import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { jsonResponse } from "@/lib/json";
import { putLocalFile } from "@/lib/storage";
import { parseMultipart } from "@/lib/parseMultipart";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";
import { getDurationSec } from "@/lib/pipeline/ffmpeg";
import { mkdtemp, rm, stat } from "fs/promises";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { tmpdir } from "os";
import path from "path";
import { z } from "zod";

// Étape 1 du formulaire d'ajout d'épisode : import des rushs.
// - Upload direct (glisser-déposer) : pleinement fonctionnel, multipart/form-data,
//   streamé sur disque (jamais bufferisé entièrement en mémoire, un rush
//   vidéo peut peser plusieurs centaines de Mo).
// - Smash / Google Drive / Dropbox : référence externe enregistrée, rapatriée
//   par le worker au lancement du pipeline (cf. lib/pipeline/ingest.ts), pas
//   de transcription immédiate possible tant que le fichier n'est pas rapatrié.
// WeTransfer est explicitement hors scope (cf. brief).

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId } = await params;
  const episode = await requireOwnedEpisode(userId, episodeId);

  // Épisode déjà exporté : figé, cf. /restart-tunnel pour le raisonnement
  // (empêche de réutiliser indéfiniment le même épisode avec des rushs
  // différents pour contourner la limite du forfait gratuit).
  if (episode.status === "EXPORTED") {
    return NextResponse.json({ error: "Cet épisode a déjà été exporté et ne peut plus être modifié." }, { status: 403 });
  }

  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const tmpDir = await mkdtemp(path.join(tmpdir(), "podtool-rush-"));
    let originalFilename: string | null = null;
    let tmpPath: string | null = null;

    try {
      await parseMultipart(req, async (file) => {
        if (file.fieldName !== "file" || !file.filename) {
          file.stream.resume();
          return;
        }
        originalFilename = file.filename;
        tmpPath = path.join(tmpDir, file.filename);
        await pipeline(file.stream, createWriteStream(tmpPath));
      });

      if (!tmpPath || !originalFilename) {
        return NextResponse.json({ error: "Fichier manquant." }, { status: 400 });
      }

      const { size: fileSizeBytes } = await stat(tmpPath);
      const storageKey = `rushes/${episodeId}/${randomUUID()}-${originalFilename}`;
      await putLocalFile(storageKey, tmpPath);

      // Durée (via ffmpeg) quand disponible sur la machine ; en son absence le
      // rush reste utilisable, seule sa durée ne s'affiche pas. Transcription
      // du transcript de l'épisode (pour la sélection des passages à couper)
      // volontairement PAS déclenchée ici : cf. app/api/episodes/[id]/transcript,
      // choisie explicitement par l'utilisateur à l'étape "Cut", s'il y a
      // plusieurs rushs séparés (caméras non synchronisées), les diariser
      // indépendamment donnerait des locuteurs incohérents d'un fichier à
      // l'autre, donc pas de fusion automatique, on lui demande sur quel
      // fichier baser le transcript.
      let durationSec: number | null = null;
      try {
        durationSec = await getDurationSec(tmpPath);
      } catch (err) {
        // Durée best-effort : on log et on continue, l'upload ne doit pas
        // échouer si ffmpeg n'est pas installé.
        console.warn(`[rushes] durée indisponible pour ${originalFilename}:`, (err as Error).message);
      }

      const rush = await prisma.rushSource.create({
        data: {
          episodeId,
          type: "UPLOAD",
          status: "READY",
          originalFilename,
          storageKey,
          durationSec,
          fileSizeBytes: BigInt(fileSizeBytes),
        },
      });
      return jsonResponse(rush);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  }

  const bodySchema = z.object({
    type: z.enum(["SMASH", "GOOGLE_DRIVE", "DROPBOX"]),
    externalRef: z.string().min(1),
  });
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  const rush = await prisma.rushSource.create({
    data: {
      episodeId,
      type: parsed.data.type,
      status: "PENDING",
      externalRef: parsed.data.externalRef,
    },
  });
  return jsonResponse(rush);
}
