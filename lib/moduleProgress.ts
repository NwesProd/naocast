// Ordre et logique de "quel module ouvrir en premier" partagés entre la
// liste d'épisodes (clic sur une carte, cf. EpisodeCard.tsx) et la sidebar
// (cf. components/SidebarNav.tsx), pour rester strictement cohérents : un
// module considéré "verrouillé" ici l'est aussi dans la sidebar, et
// inversement. Fichier sans dépendance Prisma/serveur, importable tel quel
// depuis un composant client.

export interface EpisodeModuleState {
  title: string | null;
  status: string;
  // Validé à la main par l'utilisateur, post-production faite hors naocast.
  montageValidatedExternally: boolean;
  guestsCastingValidated: boolean;
  hasTranscript: boolean;
  scriptValidated: boolean;
}

export function isMontageDone(state: Pick<EpisodeModuleState, "status" | "montageValidatedExternally">): boolean {
  return state.montageValidatedExternally || state.status === "EXPORTED";
}

// Statut affiché (carte de l'épisode, dashboard du podcast), calculé et jamais stocké.
// Du plus avancé au moins avancé :
// - DIFFUSÉ : montage validé et date de sortie atteinte ;
// - PRÊT À DIFFUSER : montage validé (date à venir ou absente) ;
// - POST-PROD : montage ou transcript commencé ;
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
  if (signals.montageStarted || signals.transcriptStarted) return "POST_PROD";
  if (signals.prodEnabled && (signals.scriptStarted || signals.guestsStarted)) return "PROD";
  return "DRAFT";
}

// Date du jour (AAAA-MM-JJ) à Paris, pour comparer à la date de sortie.
export function todayInParis(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
}

// Compteurs à demander à Prisma (`_count`) pour calculer le statut affiché d'une liste d'épisodes.
export const EPISODE_COUNTS_SELECT = { transcriptSegments: true, rushes: true, episodeGuests: true } as const;

export interface EpisodeCounts {
  transcriptSegments: number;
  rushes: number;
  episodeGuests: number;
}

// displayStatus à partir d'un épisode tel que lu en base (+ compteurs), partagé par la
// liste d'épisodes, le dashboard du podcast et le connecteur Claude.
export function episodeDisplayStatus(
  ep: {
    title: string | null;
    status: string;
    releaseDate: Date | null;
    editorChoice: string | null;
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
    montageStarted: ep.status !== "DRAFT" || ep.editorChoice !== null || counts.rushes > 0,
    transcriptStarted: counts.transcriptSegments > 0,
  });
}

// Épisode pas encore paramétré (pas de titre) : direction la page d'infos,
// aucun module n'est déverrouillé avant ça (cf. sidebar : "Sélectionne un
// épisode pour débloquer les modules"). Sinon, le premier module à valider
// (Script, Invités, Montage, Transcript ; Tournage est facultatif et n'en fait pas partie,
// Extraits et Miniature ne sont pas encore construits) qui n'est pas encore "terminé" ; si tous le
// sont, direction Diffusion (ou Montage si le forfait n'y donne pas accès).
export function firstOpenModuleHref(
  episodeId: string,
  state: EpisodeModuleState,
  // Sans accès à Script/Invités (free, basic), on commence au Montage : jamais un module verrouillé.
  opts: { prodEnabled?: boolean; diffusionEnabled?: boolean } = {}
): string {
  if (!state.title) return `/episodes/${episodeId}/new`;

  const montageHref = `/episodes/${episodeId}/montage`;

  const modules: { done: boolean; href: string }[] = [
    ...(opts.prodEnabled === false
      ? []
      : [
          { done: state.scriptValidated, href: `/episodes/${episodeId}/script` },
          { done: state.guestsCastingValidated, href: `/episodes/${episodeId}/guests` },
        ]),
    { done: isMontageDone(state), href: montageHref },
    { done: state.hasTranscript, href: `/episodes/${episodeId}/transcript` },
  ];

  // Tout est validé : on arrive sur Diffusion (statistiques de l'épisode) quand le forfait y donne accès.
  return modules.find((m) => !m.done)?.href ?? (opts.diffusionEnabled ? `/episodes/${episodeId}/diffusion` : montageHref);
}
