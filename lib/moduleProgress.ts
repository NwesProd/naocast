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
  // Validés à la main par l'utilisateur, post-production faite hors naocast.
  introValidatedExternally: boolean;
  montageValidatedExternally: boolean;
  guestsCastingValidated: boolean;
  hasTranscript: boolean;
  scriptValidated: boolean;
}

export function isIntroDone(
  state: Pick<EpisodeModuleState, "introTeaserChoice" | "introTeaserValidated" | "introValidatedExternally">
): boolean {
  return (
    state.introValidatedExternally ||
    state.introTeaserChoice === "IMPORT" ||
    (state.introTeaserChoice === "MODULE" && state.introTeaserValidated)
  );
}

export function isMontageDone(state: Pick<EpisodeModuleState, "status" | "montageValidatedExternally">): boolean {
  return state.montageValidatedExternally || state.status === "EXPORTED";
}

// Statut affiché sur la carte de l'épisode. Une fois la post-production
// complète (intro, montage et transcript validés, dans naocast ou hors
// naocast), l'épisode est "Prêt à diffuser" tant que sa date de sortie est à
// venir (ou absente), et "Diffusé" dès le jour de sortie. Les statuts en cours
// de route (traitement, échec, chez le monteur) priment toujours : tant que le
// pipeline travaille, on n'affiche pas "prêt". `todayYmd` : date du jour au
// format AAAA-MM-JJ, dans le fuseau de l'utilisateur.
export type DisplayStatus = string;

export function displayStatus(state: EpisodeModuleState, releaseDate: Date | null, todayYmd: string): DisplayStatus {
  const settled = state.status === "DRAFT" || state.status === "READY_FOR_REVIEW" || state.status === "EXPORTED";
  const allDone = isIntroDone(state) && isMontageDone(state) && state.hasTranscript;
  if (!settled || !allDone) return state.status;

  // La date de sortie est stockée à minuit UTC du jour choisi.
  const releaseYmd = releaseDate ? releaseDate.toISOString().slice(0, 10) : null;
  return releaseYmd && releaseYmd <= todayYmd ? "PUBLISHED" : "READY_TO_PUBLISH";
}

// Date du jour (AAAA-MM-JJ) à Paris, pour comparer à la date de sortie.
export function todayInParis(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
}

// displayStatus à partir d'un épisode tel que lu en base (+ nombre de phrases
// de transcript), partagé par la liste d'épisodes et le dashboard du podcast.
export function episodeDisplayStatus(
  ep: {
    title: string | null;
    status: string;
    releaseDate: Date | null;
    introTeaserChoice: "NONE" | "MODULE" | "IMPORT";
    introTeaserValidated: boolean;
    introValidatedExternally: boolean;
    montageValidatedExternally: boolean;
    guestsCastingValidated: boolean;
    scriptValidated: boolean;
  },
  transcriptSegmentCount: number
): DisplayStatus {
  return displayStatus({ ...ep, hasTranscript: transcriptSegmentCount > 0 }, ep.releaseDate, todayInParis());
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
