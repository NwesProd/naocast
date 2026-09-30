import { prisma } from "@/lib/db";
import { fetchRush } from "@/lib/pipeline/ingest";
import { buildBody, runTranscription, runAutocut, renderVideo, runExportAudio, finalVideoPathFor } from "@/lib/pipeline/render";
import { runManualTranscribe } from "@/lib/pipeline/manualTranscript";
import type { ProcessingJob } from "@/app/generated/prisma/client";

// Rapporte l'avancement (0-1) d'une étape ffmpeg dans ProcessingJob.progressPercent,
// pour que la barre de "Traitement en cours" (cf. ReviewClient) avance en
// continu plutôt que par palier (un incrément par job terminé). Throttlé :
// écrire en base à chaque frame ffmpeg (plusieurs fois par seconde)
// surchargerait la DB pour un gain visuel nul.
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

// Exécute un job du pipeline. Le worker (worker/run.ts) traite les jobs d'un
// même épisode dans l'ordre de `sequence`, jamais en parallèle : chaque étape
// dépend du fichier produit par la précédente (cf. lib/pipeline/render.ts).
export async function runJob(job: ProcessingJob): Promise<void> {
  const episodeId = job.episodeId;
  const onProgress = makeProgressReporter(job.id);

  switch (job.type) {
    case "FETCH_RUSHES": {
      const rushes = await prisma.rushSource.findMany({
        where: { episodeId, selectedForEpisode: true },
      });
      for (const rush of rushes) {
        if (rush.status !== "READY") {
          await fetchRush(rush.id, `/tmp/podtool-fetch-${rush.id}`);
        }
      }
      await buildBody(episodeId, onProgress);
      break;
    }
    case "TRANSCRIBE": {
      const bodyPath = await buildBody(episodeId);
      await runTranscription(episodeId, bodyPath);
      break;
    }
    case "AUTOCUT": {
      const episode = await prisma.episode.findUniqueOrThrow({ where: { id: episodeId } });
      const bodyPath = await buildBody(episodeId);
      await runAutocut(episodeId, bodyPath, episode.autocutSilenceMs ?? 800);
      break;
    }
    case "APPLY_MANUAL_CUTS": {
      // Fusionné dans RENDER (cf. lib/pipeline/render.ts, renderVideo) : les
      // découpes ne produisent plus d'artefact intermédiaire séparé, tout se
      // fait en un seul passage ffmpeg. Ce type de job n'est plus jamais
      // enqueued (cf. enqueue.ts) mais reste géré ici en no-op au cas où un
      // vieux job PENDING d'avant ce changement traînerait encore.
      break;
    }
    case "RENDER": {
      const bodyPath = await buildBody(episodeId);
      await renderVideo(episodeId, bodyPath, onProgress);
      break;
    }
    case "EXPORT_AUDIO": {
      await runExportAudio(episodeId, await finalVideoPathFor(episodeId), onProgress);
      break;
    }
    case "SYNC_MULTICAM": {
      // Non implémenté par conception, cf. lib/pipeline/multicam.ts.
      // Les épisodes multicam ne créent jamais ce job (voir enqueue.ts).
      throw new Error("SYNC_MULTICAM ne devrait jamais être enqueued (multicam non implémenté).");
    }
    case "MANUAL_TRANSCRIBE": {
      const episode = await prisma.episode.findUniqueOrThrow({ where: { id: episodeId } });
      if (!episode.transcriptRushId) throw new Error("Aucun rush choisi pour la transcription.");
      await runManualTranscribe(episodeId, episode.transcriptRushId, episode.expectedSpeakerCount);
      break;
    }
  }
}
