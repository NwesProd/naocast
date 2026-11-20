import { prisma } from "@/lib/db";
import { runExportAudio, finalVideoPathFor } from "@/lib/pipeline/render";
import { runManualTranscribe } from "@/lib/pipeline/manualTranscript";
import type { ProcessingJob } from "@/app/generated/prisma/client";

// Rapporte l'avancement (0-1) d'une étape ffmpeg dans ProcessingJob.progressPercent,
// pour que la barre de progression avance en continu. Throttlé : écrire en base à chaque
// frame ffmpeg surchargerait la DB pour un gain visuel nul.
function makeProgressReporter(jobId: string): (fraction: number) => void {
  let lastWriteAt = 0;
  let lastPercent = -1;
  return (fraction: number) => {
    const percent = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
    const now = Date.now();
    if (percent === lastPercent || now - lastWriteAt < 1000) return;
    lastWriteAt = now;
    lastPercent = percent;
    prisma.processingJob.update({ where: { id: jobId }, data: { progressPercent: percent } }).catch(() => {
      // Best-effort : un rapport de progression raté ne doit jamais faire échouer le job.
    });
  };
}

// Exécute un job. Le montage ne se fait plus dans naocast : il ne reste que l'extraction de
// l'audio de l'épisode final (EXPORT_AUDIO) et la transcription (MANUAL_TRANSCRIBE). Les
// anciens types de jobs (rendu, coupes...) ne sont plus créés ; un vieux job en attente échoue
// avec un message clair plutôt que de bloquer la file.
export async function runJob(job: ProcessingJob): Promise<void> {
  const episodeId = job.episodeId;

  switch (job.type) {
    case "EXPORT_AUDIO": {
      await runExportAudio(episodeId, await finalVideoPathFor(episodeId), makeProgressReporter(job.id));
      break;
    }
    case "MANUAL_TRANSCRIBE": {
      const episode = await prisma.episode.findUniqueOrThrow({ where: { id: episodeId } });
      if (!episode.transcriptRushId) throw new Error("Aucune source choisie pour la transcription.");
      await runManualTranscribe(episodeId, episode.transcriptRushId, episode.expectedSpeakerCount);
      break;
    }
    default:
      throw new Error(`Type de job abandonné : ${job.type}.`);
  }
}
