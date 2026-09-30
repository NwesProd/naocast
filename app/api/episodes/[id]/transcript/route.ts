import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";
import { jsonResponse } from "@/lib/json";
import { z } from "zod";

// Étape "Cut" du tunnel de montage : génère (ou régénère) le transcript de
// l'épisode à partir d'UN SEUL rush choisi explicitement par l'utilisateur.
// Pas de fusion multi-fichiers : diariser chaque rush indépendamment ne
// garantit pas des labels de locuteurs cohérents d'un fichier à l'autre (cf.
// lib/pipeline/diarize.ts), donc s'il y a plusieurs rushs sélectionnés,
// l'interface demande lequel utiliser plutôt que de deviner.
// expectedSpeakerCount : transmis à pyannote.ai (numSpeakers) quand
// l'utilisateur connaît le nombre exact de locuteurs, laisser le modèle le
// deviner se trompe régulièrement en conditions réelles (ex. 2 détectés au
// lieu de 4).
//
// Ne fait plus le travail dans la requête elle-même (transcription +
// diarization pyannote.ai, cette dernière pouvant prendre plusieurs minutes
// de polling) : passe par la file de jobs (MANUAL_TRANSCRIBE, cf.
// worker/pipeline.ts), sans quoi la requête dépasse le timeout du proxy
// Railway sur un épisode un peu long (502 constaté en conditions réelles).
// Le client poll GET /api/episodes/[id] (déjà utilisé ailleurs pour les jobs
// du pipeline automatique) jusqu'à ce que le job retourné ici soit terminé.
const bodySchema = z.object({ rushId: z.string().min(1), expectedSpeakerCount: z.number().int().positive().nullable().optional() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId } = await params;
  await requireOwnedEpisode(userId, episodeId);

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  const rush = await prisma.rushSource.findFirst({
    where: { id: parsed.data.rushId, episodeId, status: "READY" },
  });
  if (!rush) {
    return NextResponse.json({ error: "Rush introuvable ou pas encore prêt." }, { status: 400 });
  }

  await prisma.episode.update({
    where: { id: episodeId },
    data: {
      transcriptRushId: parsed.data.rushId,
      expectedSpeakerCount: parsed.data.expectedSpeakerCount ?? null,
    },
  });

  const maxSeq = await prisma.processingJob.aggregate({ where: { episodeId }, _max: { sequence: true } });
  const job = await prisma.processingJob.create({
    data: { episodeId, type: "MANUAL_TRANSCRIBE", sequence: (maxSeq._max.sequence ?? -1) + 1 },
  });

  return jsonResponse({ jobId: job.id }, { status: 202 });
}
