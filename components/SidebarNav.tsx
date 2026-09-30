"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { hasModuleAccess, type ModuleKey } from "@/lib/plan";
import type { Plan } from "@/app/generated/prisma/client";

const LINKS = [
  { href: "/podcast", label: "Mon podcast" },
  { href: "/dashboard", label: "Épisodes" },
  { href: "/billing", label: "Abonnement" },
];

// Modules dont l'accès dépend du forfait (cf. lib/plan.ts) parmi ceux
// réellement construits, les autres ("Bientôt disponible") ne sont pas
// concernés tant qu'ils n'existent pas.
const MODULE_KEY_BY_LABEL: Record<string, ModuleKey> = {
  Script: "script",
  Invités: "invites",
  Intro: "intro",
  Montage: "montage",
  Transcript: "transcript",
};

// Persisté en localStorage : la sélection doit survivre à la navigation vers
// "Mon podcast" ou "Épisodes" (sinon l'onglet "Montage" se reverrouillerait
// dès qu'on quitte /episodes/[id]/*, alors que le but est justement de
// pouvoir y revenir). Purement une commodité de navigation : aucune donnée
// métier n'en dépend, tout est en base par ailleurs. Comme localStorage
// n'est pas isolé par compte, l'id stocké est toujours revérifié via l'API
// (cf. plus bas) avant de déverrouiller "Montage", sinon changer de compte
// dans le même navigateur laisserait l'onglet ouvert sur l'épisode d'un
// autre compte.
const STORAGE_KEY = "podko:selectedEpisodeId";

// Émis par EpisodeInfoForm après un enregistrement réussi : la sidebar garde
// son propre état (fetché une fois par id), donc un `router.refresh()` seul
// ne le met pas à jour puisque le composant ne démonte pas. Cet événement
// lui dit explicitement de recharger l'épisode sélectionné.
export const EPISODE_UPDATED_EVENT = "podko:episode-updated";

function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="shrink-0">
      <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

// Pastille "module terminé" (ex. intro validée, épisode exporté), un simple
// repère visuel dans la sidebar, pas un lien ni une action.
function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0 text-accent-teal">
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <path d="M8 12.5l2.5 2.5 5.5-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface SelectedEpisode {
  title: string | null;
  season: number | null;
  episodeNumber: number | null;
  status: string;
  introTeaserValidated: boolean;
  introTeaserChoice: "NONE" | "MODULE" | "IMPORT";
  guestsCastingValidated: boolean;
  transcriptSegments: unknown[];
  scriptValidated: boolean;
}

interface PodcastHeader {
  title: string;
  coverUrl: string | null;
}

export function SidebarNav({ podcastHeader, plan }: { podcastHeader: PodcastHeader | null; plan: Plan }) {
  const pathname = usePathname();
  const urlEpisodeId = pathname.match(/^\/episodes\/([^/]+)/)?.[1] || null;
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const [episode, setEpisode] = useState<SelectedEpisode | null>(null);

  // Lit un système externe (localStorage) au montage, ne peut pas se faire
  // pendant le rendu (SSR/hydratation) : un effect est le bon outil ici.
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCandidateId(localStorage.getItem(STORAGE_KEY));
    } catch {
      // localStorage indisponible (navigation privée...) : pas de sélection
      // persistée entre pages, tant pis, ça reste fonctionnel dans la page.
    }
  }, []);

  // Naviguer vers un épisode (liste, création) le sélectionne pour de bon :
  // synchronise l'état React avec le système externe (localStorage).
  useEffect(() => {
    if (!urlEpisodeId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCandidateId(urlEpisodeId);
    try {
      localStorage.setItem(STORAGE_KEY, urlEpisodeId);
    } catch {
      // idem : best-effort.
    }
  }, [urlEpisodeId]);

  // Revérifie systématiquement que l'épisode candidat est bien accessible
  // (existe, appartient au compte courant) avant de déverrouiller "Montage",
  // localStorage seul ne suffit pas à en garantir la propriété. Redéclenché
  // aussi par EPISODE_UPDATED_EVENT (titre/saison/n° modifiés sur place,
  // sans changement d'URL ni de candidateId).
  useEffect(() => {
    if (!candidateId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEpisode(null);
      return;
    }

    let cancelled = false;
    function load() {
      fetch(`/api/episodes/${candidateId}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (cancelled) return;
          setEpisode(data);
          if (!data) {
            try {
              localStorage.removeItem(STORAGE_KEY);
            } catch {
              // best-effort
            }
          }
        })
        .catch(() => {
          if (!cancelled) setEpisode(null);
        });
    }

    load();
    window.addEventListener(EPISODE_UPDATED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(EPISODE_UPDATED_EVENT, load);
    };
  }, [candidateId]);

  const montageHref = episode ? `/episodes/${candidateId}/montage` : null;
  const reviewHref = episode ? `/episodes/${candidateId}/review` : null;
  const introHref = episode ? `/episodes/${candidateId}/intro` : null;
  const transcriptHref = episode ? `/episodes/${candidateId}/transcript` : null;
  const guestsHref = episode ? `/episodes/${candidateId}/guests` : null;
  const scriptHref = episode ? `/episodes/${candidateId}/script` : null;
  // Le module "Montage" de la sidebar couvre deux routes : le tunnel
  // (/montage) ET la relecture qui le suit une fois l'épisode traité
  // (/review), il n'existe pas de module "Relecture" séparé, la relecture
  // EST la suite du montage. Une fois sur l'une ou l'autre, le surlignage
  // doit y être exclusivement, pas rester en plus sur "Épisodes" (sinon les
  // deux ressortent actifs à la fois, ambigu, on ne sait plus lequel
  // indique la position réelle).
  const insideMontage =
    (!!montageHref && pathname.startsWith(montageHref)) || (!!reviewHref && pathname.startsWith(reviewHref));
  const label =
    episode &&
    [episode.season != null ? `S${episode.season}` : null, episode.episodeNumber != null ? `E${episode.episodeNumber}` : null]
      .filter(Boolean)
      .join("");

  // Un module est "terminé" quand son résultat est effectivement celui qui
  // sera utilisé : pour l'Intro, un teaser validé dans le module OU un
  // fichier importé directement (les deux court-circuitent également un
  // brouillon jamais validé, cf. Episode.introTeaserChoice) ; pour le
  // Montage, l'épisode a été exporté (le tunnel + la relecture qu'il couvre
  // sont bien allés jusqu'au bout, pas seulement soumis au traitement).
  const introDone = !!episode && (episode.introTeaserChoice === "IMPORT" || (episode.introTeaserChoice === "MODULE" && episode.introTeaserValidated));
  const montageDone = episode?.status === "EXPORTED";
  const guestsDone = !!episode && episode.guestsCastingValidated;
  // Pas de notion de "validation" dédiée pour le transcript (contrairement à
  // l'intro ou au casting) : la présence d'un transcript suffit à le
  // considérer terminé.
  const transcriptDone = !!episode && episode.transcriptSegments.length > 0;
  const scriptDone = !!episode && episode.scriptValidated;

  // Modules du parcours épisode, groupés par phase de production. "Montage",
  // "Intro" et "Transcript" sont construits (déverrouillés une fois un
  // épisode sélectionné), les autres sont des emplacements réservés, à
  // coder plus tard.
  const MODULE_GROUPS: { label: string; modules: { label: string; href: string | null; done?: boolean }[] }[] = [
    {
      label: "Prod",
      modules: [
        { label: "Script", href: scriptHref, done: scriptDone },
        { label: "Invités", href: guestsHref, done: guestsDone },
        { label: "Tournage", href: null },
      ],
    },
    {
      label: "Post-prod",
      modules: [
        { label: "Intro", href: introHref, done: introDone },
        { label: "Montage", href: montageHref, done: montageDone },
        { label: "Transcript", href: transcriptHref, done: transcriptDone },
        { label: "Extraits", href: null },
        { label: "Miniature", href: null },
      ],
    },
    {
      label: "Distri",
      modules: [
        { label: "Diffusion", href: null },
        { label: "Lead magnet", href: null },
        { label: "Sponsoring", href: null },
      ],
    },
  ];

  return (
    <nav className="flex-1 px-3 space-y-1">
      {podcastHeader && (
        <>
          <Link
            href="/podcast/dashboard"
            className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold truncate ${
              pathname === "/podcast/dashboard" ? "bg-primary-button text-white" : "text-peach-ink hover:bg-white/40"
            }`}
            title={podcastHeader.title}
          >
            {podcastHeader.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- fichier utilisateur servi dynamiquement (local ou signé), pas un asset buildé
              <img
                src={podcastHeader.coverUrl}
                alt=""
                className="h-6 w-6 rounded object-cover shrink-0"
              />
            ) : (
              <span className="h-6 w-6 rounded bg-peach-ink/20 text-[11px] font-bold flex items-center justify-center shrink-0">
                {podcastHeader.title.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="truncate">{podcastHeader.title}</span>
          </Link>
          <hr className="my-2 border-peach-muted/20" />
        </>
      )}

      {LINKS.map((link) => {
        const active =
          pathname === link.href || (link.href === "/dashboard" && pathname.startsWith("/episodes") && !insideMontage);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`block rounded-md px-3 py-2 text-sm font-medium ${
              active ? "bg-primary-button text-white" : "text-peach-muted hover:text-peach-ink"
            }`}
          >
            {link.label}
          </Link>
        );
      })}

      <hr className="my-2 border-peach-muted/20" />

      {episode && (
        <div className="px-3 py-1.5 text-sm text-peach-muted truncate cursor-default" title={episode.title || "Sans titre"}>
          {label ? `${label} · ${episode.title || "Sans titre"}` : episode.title || "Sans titre"}
        </div>
      )}

      {!episode && (
        <p className="px-3 py-1.5 text-xs text-peach-muted">
          Sélectionne un épisode pour débloquer les modules
        </p>
      )}

      {MODULE_GROUPS.map((group) => (
        <div key={group.label} className="pt-2">
          <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wide text-peach-muted/70">{group.label}</p>
          {group.modules.map((mod) => {
            const moduleKey = MODULE_KEY_BY_LABEL[mod.label];
            const planLocked = !!moduleKey && !hasModuleAccess(plan, moduleKey);

            if (mod.href && !planLocked) {
              return (
                <Link
                  key={mod.label}
                  href={mod.href}
                  className={`flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm font-medium ${
                    (mod.label === "Montage" ? insideMontage : pathname.startsWith(mod.href))
                      ? "bg-primary-button text-white"
                      : "text-peach-muted hover:text-peach-ink"
                  }`}
                >
                  <span>{mod.label}</span>
                  {mod.done && <CheckIcon />}
                </Link>
              );
            }

            return (
              <div
                key={mod.label}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-peach-muted/50 cursor-not-allowed"
                title={
                  planLocked
                    ? "Réservé à naocast infinity et naocast lifetime"
                    : mod.label === "Montage" ||
                        mod.label === "Intro" ||
                        mod.label === "Transcript" ||
                        mod.label === "Invités" ||
                        mod.label === "Script"
                      ? "Sélectionnez un épisode pour y accéder"
                      : "Bientôt disponible"
                }
              >
                <LockIcon />
                {mod.label}
              </div>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
