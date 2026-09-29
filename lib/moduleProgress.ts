// Ordre et logique de "quel module ouvrir en premier" partagés entre la
// liste d'épisodes (clic sur une carte, cf. EpisodeCard.tsx) et la sidebar
// (cf. components/SidebarNav.tsx), pour rester strictement cohérents : un
// module considéré "verrouillé" ici l'est aussi dans la sidebar, et
// inversement. Fichier sans dépendance Prisma/serveur, importable tel quel
// depuis un composant client.

export interface EpisodeModuleState {
  title: string | null;
  status: string;
  introTeaserChoice: "NONE" | "MODULE" | "IMPORT";
  introTeaserValidated: boolean;
  guestsCastingValidated: boolean;
  hasTranscript: boolean;
  scriptValidated: boolean;
}

export function isIntroDone(state: Pick<EpisodeModuleState, "introTeaserChoice" | "introTeaserValidated">): boolean {
  return state.introTeaserChoice === "IMPORT" || (state.introTeaserChoice === "MODULE" && state.introTeaserValidated);
}

export function isMontageDone(state: Pick<EpisodeModuleState, "status">): boolean {
  return state.status === "EXPORTED";
}

// Épisode pas encore paramétré (pas de titre) : direction la page d'infos,
// aucun module n'est déverrouillé avant ça (cf. sidebar : "Sélectionne un
// épisode pour débloquer les modules"). Sinon, le premier module déverrouillé
// (Script/Tournage/Extraits/Miniature/Distri restent verrouillés, jamais
// proposés) qui n'est pas encore "terminé" ; si tous le sont, direction le
// tunnel de montage/relecture (page centrale de l'épisode).
export function firstOpenModuleHref(episodeId: string, state: EpisodeModuleState): string {
  if (!state.title) return `/episodes/${episodeId}/new`;

  const montageHref = state.status === "DRAFT" ? `/episodes/${episodeId}/montage` : `/episodes/${episodeId}/review`;

  const modules: { done: boolean; href: string }[] = [
    { done: state.scriptValidated, href: `/episodes/${episodeId}/script` },
    { done: state.guestsCastingValidated, href: `/episodes/${episodeId}/guests` },
    { done: isIntroDone(state), href: `/episodes/${episodeId}/intro` },
    { done: isMontageDone(state), href: montageHref },
    { done: state.hasTranscript, href: `/episodes/${episodeId}/transcript` },
  ];

  return modules.find((m) => !m.done)?.href ?? montageHref;
}
