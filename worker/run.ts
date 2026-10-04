import "dotenv/config";
import { prisma } from "@/lib/db";
import { runJob } from "@/worker/pipeline";
import { cleanupExportedEpisodeFiles } from "@/lib/pipeline/cleanup";

// Worker minimal : interroge la table ProcessingJob toutes les POLL_INTERVAL_MS
// et exécute le prochain job PENDING le plus ancien, épisode par épisode, dans
// l'ordre de `sequence`. Choix volontaire pour l'MVP : pas de file d'attente
// externe (Redis/BullMQ), une table Postgres suffit à ce stade et évite une
// dépendance d'infra de plus. À lancer via `npm run worker`.

const POLL_INTERVAL_MS = 3000;

// La connexion Postgres de ce process (longue durée, contrairement aux
// requêtes web ponctuelles) peut occasionnellement se faire fermer côté
// serveur entre deux requêtes (constaté en dev : erreur Prisma P1017
// "Server has closed the connection", même sur une requête quasi
// instantanée), une nouvelle tentative repart sur une connexion fraîche du
// pool plutôt que de faire échouer à tort la mise à jour de statut d'un job.
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  throw lastErr;
}

async function tick(): Promise<boolean> {
  // Parcourt TOUS les jobs PENDING (pas juste le premier) : un épisode bloqué
  // (ex. un job FAILED laissé en place, avec des PENDING derrière lui dans la
  // séquence) ne doit pas empêcher de traiter les jobs des autres épisodes,
  // sinon un seul épisode en échec suffit à geler le worker pour tout le monde.
  const pendingJobs = await prisma.processingJob.findMany({
    where: { status: "PENDING" },
    orderBy: [{ episodeId: "asc" }, { sequence: "asc" }],
  });

  let job: (typeof pendingJobs)[number] | null = null;
  for (const candidate of pendingJobs) {
    const blockingJob = await prisma.processingJob.findFirst({
      where: { episodeId: candidate.episodeId, sequence: { lt: candidate.sequence }, status: { not: "DONE" } },
    });
    if (!blockingJob) {
      job = candidate;
      break;
    }
  }
  if (!job) return false;

  // MANUAL_TRANSCRIBE tourne "à côté" du pipeline principal (déclenché depuis
  // le tunnel de montage ou la relecture, sur un seul rush, indépendamment de
  // l'avancement du reste) : il ne doit jamais faire basculer le statut de
  // l'épisode (PROCESSING/READY_FOR_REVIEW/FAILED), qui refléterait alors à
  // tort l'état du pipeline automatique aux yeux de la sidebar/relecture.
  //
  // Même chose pour la prévisualisation du tunnel (PREVIEW_RENDER et les jobs
  // qui la préparent) : un épisode encore en DRAFT n'a, par construction, que
  // des jobs "à côté" (le pipeline complet le passe d'abord en QUEUED, cf.
  // enqueueEpisodePipeline), ils ne doivent pas le faire passer en
  // PROCESSING ni en "prêt pour relecture".
  const episodeNow = await prisma.episode.findUnique({ where: { id: job.episodeId }, select: { status: true } });
  const affectsEpisodeStatus =
    job.type !== "MANUAL_TRANSCRIBE" && job.type !== "PREVIEW_RENDER" && episodeNow?.status !== "DRAFT";

  await withRetry(() =>
    prisma.processingJob.update({
      where: { id: job.id },
      data: { status: "RUNNING", startedAt: new Date() },
    })
  );
  if (affectsEpisodeStatus) {
    await withRetry(() => prisma.episode.update({ where: { id: job.episodeId }, data: { status: "PROCESSING" } }));
  }

  console.log(`[worker] ${job.type} - épisode ${job.episodeId}`);
  try {
    await runJob(job);
    await withRetry(() =>
      prisma.processingJob.update({
        where: { id: job.id },
        data: { status: "DONE", finishedAt: new Date() },
      })
    );
    if (affectsEpisodeStatus) {
      // Le job qui termine le pipeline varie selon la config (EXPORT_AUDIO le
      // plus souvent, mais pas forcément), on marque l'épisode prêt ici, une
      // fois qu'il ne reste plus aucun job non terminé, plutôt que de le faire
      // dans un job précis dont le statut serait aussitôt écrasé par le
      // passage à "PROCESSING" du job suivant.
      const remaining = await withRetry(() =>
        prisma.processingJob.count({
          where: { episodeId: job.episodeId, status: { not: "DONE" }, type: { not: "MANUAL_TRANSCRIBE" } },
        })
      );
      if (remaining === 0) {
        // EXPORT_AUDIO n'est jamais inclus dans le pipeline automatique (cf.
        // enqueueEpisodePipeline), il n'est créé que par la validation en
        // relecture (cf. /validate), donc le voir terminer signifie que
        // l'export final est prêt, pas que le pipeline de montage l'est.
        const nextStatus = job.type === "EXPORT_AUDIO" ? "EXPORTED" : "READY_FOR_REVIEW";
        await withRetry(() => prisma.episode.update({ where: { id: job.episodeId }, data: { status: nextStatus } }));
        if (nextStatus === "EXPORTED") {
          // Épisode définitivement figé (cf. /restart-tunnel) : seuls les
          // exports vidéo et audio finaux servent encore, tout le reste
          // (rushs, génériques d'épisode, teaser) libère le stockage R2/B2
          // (best-effort, ne doit jamais faire échouer le job déjà marqué
          // DONE).
          await cleanupExportedEpisodeFiles(job.episodeId).catch((err) =>
            console.warn(`[worker] nettoyage des fichiers échoué pour l'épisode ${job.episodeId}:`, err)
          );
        }
      }
    }
  } catch (err) {
    console.error(`[worker] échec ${job.type} - épisode ${job.episodeId}:`, err);
    await withRetry(() =>
      prisma.processingJob.update({
        where: { id: job.id },
        data: { status: "FAILED", finishedAt: new Date(), errorMessage: (err as Error).message },
      })
    );
    if (affectsEpisodeStatus) {
      await withRetry(() => prisma.episode.update({ where: { id: job.episodeId }, data: { status: "FAILED" } }));
    }
  }
  return true;
}

async function loop() {
  console.log("[worker] démarré, en écoute des jobs...");
  for (;;) {
    // Filet de sécurité : si tick() lève malgré les tentatives de withRetry
    // (ex. les 3 essais de la mise à jour "FAILED" échouent tous), le worker
    // ne doit pas planter silencieusement (promesse rejetée non gérée) et
    // arrêter tout traitement pour tous les épisodes, il boucle et retente.
    let didWork = false;
    try {
      didWork = await tick();
    } catch (err) {
      console.error("[worker] tick() a échoué, nouvelle tentative au prochain cycle:", err);
    }
    await new Promise((r) => setTimeout(r, didWork ? 250 : POLL_INTERVAL_MS));
  }
}

loop();
