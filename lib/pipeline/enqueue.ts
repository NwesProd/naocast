import { prisma } from "@/lib/db";
import { JobType } from "@/app/generated/prisma/client";

// Construit la liste ordonnée des jobs du pipeline automatique pour un épisode,
// à partir des choix faits dans le formulaire (étape "traitement automatique"
// du brief). Le worker (worker/run.ts) les exécute ensuite dans l'ordre.
export async function enqueueEpisodePipeline(episodeId: string): Promise<void> {
  const episode = await prisma.episode.findUniqueOrThrow({ where: { id: episodeId } });

  // "J'ai besoin d'un monteur" (étape "1. Monteur") : l'utilisateur passe par
  // le même tunnel (import, découpes, génériques...) que le pipeline
  // automatique, mais à la toute dernière étape ("Lancer"), au lieu de
  // lancer l'autocut/rendu automatique, l'épisode bascule vers le montage
  // humain, même traitement que le cas caméras séparées ci-dessous.
  if (episode.cameraSetup === "MULTI_CAMERA" || episode.editorChoice === "NEED_EDITOR") {
    // La synchro/switch multicam n'est pas implémentée (cf. lib/pipeline/multicam.ts).
    // On ne fait pas semblant : l'épisode bascule directement vers le montage humain.
    await prisma.episode.update({
      where: { id: episodeId },
      data: { status: "HUMAN_EDITOR_REQUESTED", humanEditorRequestedAt: new Date() },
    });
    return;
  }

  // La transcription tourne déjà de façon synchrone à l'upload de chaque rush
  // (cf. app/api/episodes/[id]/rushes/route.ts), elle alimente l'étape
  // "analyse du transfert" et l'UI de sélection des passages à couper avant
  // même la soumission du formulaire. Pas besoin de la refaire ici.
  // EXPORT_AUDIO n'est volontairement pas inclus ici : il n'est lancé
  // qu'une fois le rendu vidéo validé en relecture (cf. /validate), pas
  // pendant le pipeline automatique.
  const types: JobType[] = ["FETCH_RUSHES"];
  if (episode.autocutEnabled) types.push("AUTOCUT");
  // Découpe + assemblage générique + logo en un seul job (cf.
  // lib/pipeline/render.ts, renderVideo) : un seul passage ffmpeg, plus
  // besoin d'un job APPLY_MANUAL_CUTS séparé pour un artefact intermédiaire
  // qui n'existe plus.
  types.push("RENDER");

  await prisma.$transaction([
    prisma.processingJob.deleteMany({ where: { episodeId, status: "PENDING" } }),
    prisma.processingJob.createMany({
      data: types.map((type, i) => ({ episodeId, type, sequence: i })),
    }),
    prisma.episode.update({ where: { id: episodeId }, data: { status: "QUEUED" } }),
  ]);
}
