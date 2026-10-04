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
  // Autocut désactivé depuis : les silences détectés lors d'une
  // prévisualisation précédente ne doivent pas rester appliqués au rendu final.
  const dropStaleAutocut = episode.autocutEnabled
    ? []
    : [prisma.cutMarker.deleteMany({ where: { episodeId, source: "AUTOCUT" } })];
  // Découpe + assemblage générique + logo en un seul job (cf.
  // lib/pipeline/render.ts, renderVideo) : un seul passage ffmpeg, plus
  // besoin d'un job APPLY_MANUAL_CUTS séparé pour un artefact intermédiaire
  // qui n'existe plus.
  types.push("RENDER");

  await prisma.$transaction([
    ...dropStaleAutocut,
    // Les jobs de la prévisualisation (déjà terminés) n'ont plus rien à faire
    // dans la liste du pipeline final.
    prisma.processingJob.deleteMany({
      where: { episodeId, OR: [{ status: "PENDING" }, { type: { in: ["FETCH_RUSHES", "AUTOCUT", "PREVIEW_RENDER"] }, status: "DONE" }] },
    }),
    prisma.processingJob.createMany({
      data: types.map((type, i) => ({ episodeId, type, sequence: i })),
    }),
    prisma.episode.update({ where: { id: episodeId }, data: { status: "QUEUED" } }),
  ]);
}

// Prévisualisation du tunnel de montage (étape "Prévisualisation") : prépare
// le corps (rapatrie les rushs, assemble), détecte les silences si l'option
// est activée, puis rend une version basse définition. L'épisode reste en
// DRAFT (cf. worker/run.ts) ; renvoie l'id du job de rendu à suivre.
export async function enqueueEpisodePreview(episodeId: string): Promise<string> {
  const episode = await prisma.episode.findUniqueOrThrow({ where: { id: episodeId } });

  const types: JobType[] = ["FETCH_RUSHES"];
  if (episode.autocutEnabled) types.push("AUTOCUT");
  types.push("PREVIEW_RENDER");

  // Repart d'une liste propre : anciens jobs de prévisualisation, en échec ou
  // en attente (ils bloqueraient les nouveaux, cf. worker/run.ts).
  await prisma.processingJob.deleteMany({
    where: {
      episodeId,
      status: { not: "RUNNING" },
      OR: [{ type: { in: ["FETCH_RUSHES", "AUTOCUT", "PREVIEW_RENDER"] } }, { status: "FAILED" }],
    },
  });
  const maxSeq = await prisma.processingJob.aggregate({ where: { episodeId }, _max: { sequence: true } });
  const base = (maxSeq._max.sequence ?? -1) + 1;

  const ops = [
    ...(episode.autocutEnabled ? [] : [prisma.cutMarker.deleteMany({ where: { episodeId, source: "AUTOCUT" as const } })]),
    prisma.processingJob.createMany({ data: types.map((type, i) => ({ episodeId, type, sequence: base + i })) }),
  ];
  await prisma.$transaction(ops);

  const render = await prisma.processingJob.findFirstOrThrow({ where: { episodeId, type: "PREVIEW_RENDER" }, orderBy: { createdAt: "desc" } });
  return render.id;
}
