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

// Statut affiché (carte de l'épisode, dashboard du podcast), calculé et jamais stocké.
// Du plus avancé au moins avancé :
// - DIFFUSÉ : montage validé et date de sortie atteinte ;
// - PRÊT À DIFFUSER : montage validé (date à venir ou absente) ;
// - POST-PROD : intro, montage ou transcript commencé ;
// - PROD : script ou invités commencé (uniquement pour les forfaits qui ont ces modules) ;
// - BROUILLON : rien de commencé.
// Les statuts "en cours de route" (traitement, échec, chez le monteur) priment toujours :
// tant que le pipeline travaille, on affiche son état réel. `todayYmd` : date du jour au
// format AAAA-MM-JJ, dans le fuseau de l'utilisateur.
export type DisplayStatus = string;

// Ce qui permet de dire qu'un module est "commencé" (tick vert = validé, c'est autre chose).
export interface ProgressSignals {
  // Le forfait (ou un déblocage manuel) donne accès à Script ou Invités : sans eux, pas de phase Prod.
  prodEnabled: boolean;
  scriptStarted: boolean;
  guestsStarted: boolean;
  introStarted: boolean;
  montageStarted: boolean;
  transcriptStarted: boolean;
}

export function displayStatus(
  state: EpisodeModuleState,
  releaseDate: Date | null,
  todayYmd: string,
  signals: ProgressSignals
): DisplayStatus {
  const settled = state.status === "DRAFT" || state.status === "READY_FOR_REVIEW" || state.status === "EXPORTED";
  if (!settled) return state.status;

  if (isMontageDone(state)) {
    // La date de sortie est stockée à minuit UTC du jour choisi.
    const releaseYmd = releaseDate ? releaseDate.toISOString().slice(0, 10) : null;
    return releaseYmd && releaseYmd <= todayYmd ? "PUBLISHED" : "READY_TO_PUBLISH";
  }
  if (signals.introStarted || signals.montageStarted || signals.transcriptStarted) return "POST_PROD";
  if (signals.prodEnabled && (signals.scriptStarted || signals.guestsStarted)) return "PROD";
  return "DRAFT";
}

// Date du jour (AAAA-MM-JJ) à Paris, pour comparer à la date de sortie.
export function todayInParis(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
}

// Compteurs à demander à Prisma (`_count`) pour calculer le statut affiché d'une liste d'épisodes.
export const EPISODE_COUNTS_SELECT = { transcriptSegments: true, rushes: true, episodeGuests: true, introSegments: true } as const;

export interface EpisodeCounts {
  transcriptSegments: number;
  rushes: number;
  episodeGuests: number;
  introSegments: number;
}

// displayStatus à partir d'un épisode tel que lu en base (+ compteurs), partagé par la
// liste d'épisodes, le dashboard du podcast et le connecteur Claude.
export function episodeDisplayStatus(
  ep: {
    title: string | null;
    status: string;
    releaseDate: Date | null;
    editorChoice: string | null;
    introTeaserChoice: "NONE" | "MODULE" | "IMPORT";
    introTeaserValidated: boolean;
    introValidatedExternally: boolean;
    montageValidatedExternally: boolean;
    guestsCastingValidated: boolean;
    scriptValidated: boolean;
    scriptDraft: string | null;
    scriptAngleIdeas: unknown;
  },
  counts: EpisodeCounts,
  prodEnabled: boolean
): DisplayStatus {
  const hasIdeas = Array.isArray(ep.scriptAngleIdeas) && ep.scriptAngleIdeas.length > 0;
  return displayStatus({ ...ep, hasTranscript: counts.transcriptSegments > 0 }, ep.releaseDate, todayInParis(), {
    prodEnabled,
    scriptStarted: ep.scriptValidated || !!ep.scriptDraft?.trim() || hasIdeas,
    guestsStarted: ep.guestsCastingValidated || counts.episodeGuests > 0,
    introStarted: ep.introValidatedExternally || ep.introTeaserValidated || ep.introTeaserChoice !== "NONE" || counts.introSegments > 0,
    montageStarted: ep.status !== "DRAFT" || ep.editorChoice !== null || counts.rushes > 0,
    transcriptStarted: counts.transcriptSegments > 0,
  });
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
