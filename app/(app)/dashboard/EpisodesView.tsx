"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { StatusBadge, statusLabel } from "@/components/StatusBadge";
import { EpisodeCard } from "./EpisodeCard";
import { EpisodeActions } from "./EpisodeActions";

export interface EpisodeListItem {
  id: string;
  title: string | null;
  status: string;
  displayStatus: string;
  progress: { done: number; total: number };
  season: number | null;
  episodeNumber: number | null;
  releaseDateLabel: string | null;
  fallbackLabel: string;
}

type View = "grid" | "kanban" | "table";

const VIEWS: { key: View; label: string }[] = [
  { key: "grid", label: "Grille" },
  { key: "kanban", label: "Kanban" },
  { key: "table", label: "Tableau" },
];

const STORAGE_KEY = "naocast.episodesView";
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readView(): View {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "kanban" || v === "table" ? v : "grid";
  } catch {
    return "grid";
  }
}

function writeView(view: View) {
  try {
    localStorage.setItem(STORAGE_KEY, view);
  } catch {
    // navigateur sans stockage : la vue revient à la grille au prochain affichage
  }
  listeners.forEach((l) => l());
}

// Colonnes du kanban, dans l'ordre de la vie d'un épisode. Les statuts transitoires (en
// traitement, chez le monteur, échec...) tombent dans « Post-prod », « Publié » dans « Diffusé ».
const KANBAN_COLUMNS = ["DRAFT", "PROD", "POST_PROD", "READY_TO_PUBLISH", "PUBLISHED"] as const;

function kanbanColumn(displayStatus: string): (typeof KANBAN_COLUMNS)[number] {
  if ((KANBAN_COLUMNS as readonly string[]).includes(displayStatus)) return displayStatus as (typeof KANBAN_COLUMNS)[number];
  if (displayStatus === "EXPORTED") return "PUBLISHED";
  return "POST_PROD";
}

function snLabel(season: number | null, episodeNumber: number | null): string {
  return [season != null ? `S${season}` : null, episodeNumber != null ? `E${episodeNumber}` : null].filter(Boolean).join("");
}

// Liste des épisodes avec choix de la vue (grille, kanban par statut, tableau), mémorisé sur
// cet appareil. Avant l'hydratation, la grille s'affiche.
export function EpisodesView({
  episodes,
  deletionLockedWhenValidated,
  prodEnabled,
}: {
  episodes: EpisodeListItem[];
  deletionLockedWhenValidated: boolean;
  prodEnabled: boolean;
}) {
  const view = useSyncExternalStore(subscribe, readView, () => "grid" as View);

  const card = (ep: EpisodeListItem) => (
    <EpisodeCard
      key={ep.id}
      id={ep.id}
      title={ep.title}
      status={ep.status}
      displayStatus={ep.displayStatus}
      progress={ep.progress}
      season={ep.season}
      episodeNumber={ep.episodeNumber}
      releaseDateLabel={ep.releaseDateLabel}
      fallbackLabel={ep.fallbackLabel}
      deletionLockedWhenValidated={deletionLockedWhenValidated}
    />
  );

  const columns = KANBAN_COLUMNS.filter((c) => prodEnabled || c !== "PROD" || episodes.some((e) => kanbanColumn(e.displayStatus) === "PROD"));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <div role="group" aria-label="Choix de la vue" className="inline-flex rounded-[10px] border border-border bg-white p-0.5">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              aria-pressed={view === v.key}
              onClick={() => writeView(v.key)}
              className={`rounded-[8px] px-3 py-1 text-xs font-semibold transition ${
                view === v.key ? "bg-primary-button text-white" : "text-text-muted hover:text-ink"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {view === "grid" && <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{episodes.map(card)}</div>}

      {view === "kanban" && (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {columns.map((col) => {
            const items = episodes.filter((e) => kanbanColumn(e.displayStatus) === col);
            return (
              <section key={col} className="min-w-[260px] flex-1 space-y-3 rounded-xl bg-[#FAFAF8] p-3">
                <h2 className="flex items-center justify-between px-1 text-sm font-semibold text-ink">
                  {statusLabel(col)}
                  <span className="text-xs font-medium text-text-muted">{items.length}</span>
                </h2>
                {items.length === 0 ? <p className="px-1 py-4 text-center text-xs text-text-muted">Aucun épisode</p> : items.map(card)}
              </section>
            );
          })}
        </div>
      )}

      {view === "table" && (
        <div className="overflow-x-auto rounded-md border border-border bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-text-muted">
                <th className="px-3 py-2 font-medium">Épisode</th>
                <th className="px-3 py-2 font-medium">Titre</th>
                <th className="px-3 py-2 font-medium">Statut</th>
                <th className="px-3 py-2 font-medium">Avancement</th>
                <th className="px-3 py-2 font-medium">Sortie</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {episodes.map((ep) => (
                <tr key={ep.id} className="border-b border-border last:border-b-0 hover:bg-[#FAFAF8]">
                  <td className="px-3 py-2 whitespace-nowrap text-text-muted">{snLabel(ep.season, ep.episodeNumber) || "-"}</td>
                  <td className="px-3 py-2">
                    <Link href={`/episodes/${ep.id}/start`} className="block max-w-[420px] truncate font-medium text-ink hover:underline">
                      {ep.title || ep.fallbackLabel}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={ep.displayStatus} />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-text-muted">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-1.5 w-20 overflow-hidden rounded-pill bg-border">
                        <span className="block h-full rounded-pill bg-primary-button" style={{ width: `${ep.progress.total ? (ep.progress.done / ep.progress.total) * 100 : 0}%` }} />
                      </span>
                      <span className="text-xs">{ep.progress.done}/{ep.progress.total}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-text-muted">{ep.releaseDateLabel ?? "-"}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end">
                      <EpisodeActions
                        id={ep.id}
                        title={ep.title}
                        fallbackLabel={ep.fallbackLabel}
                        status={ep.status}
                        deletionLockedWhenValidated={deletionLockedWhenValidated}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
