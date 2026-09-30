import { prisma } from "@/lib/db";
import { Prisma } from "@/app/generated/prisma/client";
import { getLocalWorkingPath } from "@/lib/storage";
import { workDirFor } from "@/lib/pipeline/render";
import { transcribeAudio } from "@/lib/pipeline/transcribe";
import { diarizeAudio, assignSpeakers } from "@/lib/pipeline/diarize";

// Étape "Cut" du tunnel de montage (ou "Régénérer" en relecture) : génère le
// transcript de l'épisode à partir d'UN SEUL rush choisi explicitement par
// l'utilisateur, avec reconnaissance des locuteurs (pyannote.ai). Exécuté par
// le worker (job MANUAL_TRANSCRIBE, cf. worker/pipeline.ts) plutôt que dans
// le cycle requête/réponse HTTP : la diarization est un job asynchrone côté
// pyannote.ai (polling, jusqu'à plusieurs minutes sur un épisode long), bien
// trop long pour une requête web sans provoquer de timeout côté proxy
// (502 constaté en conditions réelles sur Railway).
export async function runManualTranscribe(episodeId: string, rushId: string, expectedSpeakerCount: number | null): Promise<void> {
  const rush = await prisma.rushSource.findFirst({ where: { id: rushId, episodeId, status: "READY" } });
  if (!rush || !rush.storageKey) {
    throw new Error("Rush introuvable ou pas encore prêt.");
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
    const diarization = await diarizeAudio(localPath, expectedSpeakerCount);
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
  ]);
}
