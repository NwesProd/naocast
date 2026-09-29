import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@/app/generated/prisma/client";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";
import { jsonResponse } from "@/lib/json";
import { getLocalWorkingPath } from "@/lib/storage";
import { workDirFor } from "@/lib/pipeline/render";
import { transcribeAudio } from "@/lib/pipeline/transcribe";
import { diarizeAudio, assignSpeakers } from "@/lib/pipeline/diarize";
import { z } from "zod";

// Étape "Cut" du tunnel de montage : génère (ou régénère) le transcript de
// l'épisode à partir d'UN SEUL rush choisi explicitement par l'utilisateur.
// Pas de fusion multi-fichiers : diariser chaque rush indépendamment ne
// garantit pas des labels de locuteurs cohérents d'un fichier à l'autre (cf.
// lib/pipeline/diarize.ts), donc s'il y a plusieurs rushs sélectionnés,
// l'interface demande lequel utiliser plutôt que de deviner.
// expectedSpeakerCount : transmis à pyannote.ai (numSpeakers) quand
// l'utilisateur connaît le nombre exact de locuteurs, laisser le modèle le
// deviner se trompe régulièrement en conditions réelles (cf. lib/pipeline/diarize.ts).
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
  if (!rush || !rush.storageKey) {
    return NextResponse.json({ error: "Rush introuvable ou pas encore prêt." }, { status: 400 });
  }

  const localPath = await getLocalWorkingPath(rush.storageKey, workDirFor(episodeId));

  const segments = await transcribeAudio(localPath);

  // Reconnaissance des locuteurs : best-effort, son échec ne doit pas priver
  // l'utilisateur du transcript lui-même (cf. lib/pipeline/diarize.ts).
  let withSpeakers: (typeof segments[number] & { speaker: string | null })[] = segments.map((s) => ({
    ...s,
    speaker: null,
  }));
  const speakerLabels: string[] = [];
  try {
    const diarization = await diarizeAudio(localPath, parsed.data.expectedSpeakerCount);
    withSpeakers = assignSpeakers(segments, diarization);
    speakerLabels.push(...new Set(diarization.map((d) => d.speaker)));
  } catch (err) {
    console.warn(`[transcript] reconnaissance des locuteurs indisponible pour l'épisode ${episodeId}:`, (err as Error).message);
  }

  await prisma.$transaction([
    prisma.transcriptSegment.deleteMany({ where: { episodeId } }),
    prisma.episodeSpeaker.deleteMany({ where: { episodeId } }),
    prisma.transcriptSegment.createMany({
      data: withSpeakers.map((s) => ({
        episodeId,
        startMs: s.startMs,
        endMs: s.endMs,
        text: s.text,
        speaker: s.speaker,
        words: s.words as unknown as Prisma.InputJsonValue,
      })),
    }),
    ...(speakerLabels.length > 0
      ? [prisma.episodeSpeaker.createMany({ data: speakerLabels.map((label) => ({ episodeId, label })) })]
      : []),
    prisma.episode.update({
      where: { id: episodeId },
      data: { expectedSpeakerCount: parsed.data.expectedSpeakerCount ?? null },
    }),
  ]);

  const episode = await prisma.episode.findUnique({
    where: { id: episodeId },
    include: {
      transcriptSegments: { orderBy: { startMs: "asc" } },
      speakers: { orderBy: { label: "asc" } },
    },
  });
  return jsonResponse(episode);
}
