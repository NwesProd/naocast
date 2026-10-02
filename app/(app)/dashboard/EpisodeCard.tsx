"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/StatusBadge";
import { EPISODE_UPDATED_EVENT } from "@/components/SidebarNav";
import { firstOpenModuleHref } from "@/lib/moduleProgress";

// Couleurs de zone selon la catégorie de statut (brouillon / en traitement /
// validé) plutôt qu'un fond unique, le badge (toujours en ton plein) reste
// le seul indicateur précis du statut exact.
const ZONE_CLASSES: Record<string, { bg: string; text: string; muted: string }> = {
  DRAFT: { bg: "bg-peach", text: "text-peach-ink", muted: "text-peach-muted" },
  QUEUED: { bg: "bg-butter", text: "text-butter-ink", muted: "text-butter-ink/70" },
  PROCESSING: { bg: "bg-butter", text: "text-butter-ink", muted: "text-butter-ink/70" },
  HUMAN_EDITOR_REQUESTED: { bg: "bg-sky", text: "text-sky-ink", muted: "text-sky-ink/70" },
  READY_FOR_REVIEW: { bg: "bg-mint", text: "text-mint-ink", muted: "text-mint-muted" },
  EXPORTED: { bg: "bg-mint", text: "text-mint-ink", muted: "text-mint-muted" },
  READY_TO_PUBLISH: { bg: "bg-mint", text: "text-mint-ink", muted: "text-mint-muted" },
  PUBLISHED: { bg: "bg-mint", text: "text-mint-ink", muted: "text-mint-muted" },
  FAILED: { bg: "bg-[#FBEAE7]", text: "text-[#8A2E1F]", muted: "text-[#8A2E1F]/70" },
};
const DEFAULT_ZONE = ZONE_CLASSES.DRAFT;

function GearIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <polyline points="3 6 5 6 21 6" stroke="currentColor" strokeWidth="2" />
      <path
        d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
        stroke="currentColor"
        strokeWidth="2"
      />
      <line x1="10" y1="11" x2="10" y2="17" stroke="currentColor" strokeWidth="2" />
      <line x1="14" y1="11" x2="14" y2="17" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

interface EpisodeCardProps {
  id: string;
  title: string | null;
  status: string;
  // Statut affiché (badge, couleur) : peut être "Prêt à diffuser" / "Diffusé" une fois tout
  // validé (cf. displayStatus). `status` reste le statut réel, utilisé pour la logique.
  displayStatus: string;
  season: number | null;
  episodeNumber: number | null;
  releaseDateLabel: string | null;
  fallbackLabel: string;
  introTeaserChoice: "NONE" | "MODULE" | "IMPORT";
  introTeaserValidated: boolean;
  introValidatedExternally: boolean;
  montageValidatedExternally: boolean;
  guestsCastingValidated: boolean;
  hasTranscript: boolean;
  scriptValidated: boolean;
  // Free et basic : un épisode validé ne peut plus être supprimé (cf. lib/plan.ts).
  deletionLockedWhenValidated: boolean;
}

export function EpisodeCard({
  id,
  title,
  status,
  displayStatus,
  season,
  episodeNumber,
  releaseDateLabel,
  fallbackLabel,
  introTeaserChoice,
  introTeaserValidated,
  introValidatedExternally,
  montageValidatedExternally,
  guestsCastingValidated,
  hasTranscript,
  scriptValidated,
  deletionLockedWhenValidated,
}: EpisodeCardProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const locked = status === "EXPORTED" && deletionLockedWhenValidated;

  const zone = ZONE_CLASSES[displayStatus] || DEFAULT_ZONE;
  const sn = [season != null ? `S${season}` : null, episodeNumber != null ? `E${episodeNumber}` : null]
    .filter(Boolean)
    .join("");

  // Épisode déjà paramétré (titre renseigné) : on va directement au premier
  // module non verrouillé de la sidebar qui n'est pas encore validé (même
  // ordre et même notion de "terminé" que components/SidebarNav.tsx, cf.
  // lib/moduleProgress.ts). Sans titre : direction la page d'infos.
  const href = firstOpenModuleHref(id, {
    title,
    status,
    introTeaserChoice,
    introTeaserValidated,
    introValidatedExternally,
    montageValidatedExternally,
    guestsCastingValidated,
    hasTranscript,
    scriptValidated,
  });

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    const res = await fetch(`/api/episodes/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: undefined }));
      setDeleteError(data.error || "Échec de la suppression.");
      setDeleting(false);
      return;
    }
    // La sidebar garde son propre état (épisode sélectionné, persisté en
    // localStorage) indépendamment de cette liste, un simple router.refresh()
    // ne le met pas à jour. Si l'épisode supprimé était le sélectionné, ce
    // signal lui fait revérifier via l'API (cf. SidebarNav), constater sa
    // disparition (404) et reverrouiller les modules ; sinon, no-op inoffensif.
    window.dispatchEvent(new Event(EPISODE_UPDATED_EVENT));
    router.refresh();
  }

  return (
    <div className={`relative rounded-xl ${zone.bg} min-h-[132px]`}>
      <Link href={href} className="flex flex-col justify-between gap-4 h-full p-5 hover:brightness-95 transition rounded-xl">
        <div className="pr-14">
          {sn && <p className={`text-xs font-semibold ${zone.muted} mb-1`}>{sn}</p>}
          <p className={`font-medium ${zone.text} line-clamp-2`}>{title || fallbackLabel}</p>
          {releaseDateLabel && <p className={`text-xs ${zone.muted} mt-1`}>Sortie le {releaseDateLabel}</p>}
        </div>
        <StatusBadge status={displayStatus} />
      </Link>

      <div className="absolute top-3 right-3 flex gap-1.5">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            router.push(`/episodes/${id}/new`);
          }}
          title="Modifier les informations"
          className={`rounded-full bg-white/70 hover:bg-white p-1.5 ${zone.text} transition`}
        >
          <GearIcon />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            if (locked) return;
            setConfirming(true);
          }}
          disabled={locked}
          title={locked ? "Épisode validé : ne peut plus être supprimé avec votre forfait" : "Supprimer l'épisode"}
          className={`rounded-full bg-white/70 p-1.5 transition ${
            locked ? "text-[#8A2E1F]/30 cursor-not-allowed" : "hover:bg-white text-[#8A2E1F]"
          }`}
        >
          <TrashIcon />
        </button>
      </div>

      {confirming && (
        <div
          className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-4"
          onClick={() => !deleting && setConfirming(false)}
        >
          <div className="bg-white rounded-xl p-5 max-w-sm w-full space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-semibold text-ink">Supprimer cet épisode ?</h2>
            <p className="text-sm text-text-muted">
              « {title || fallbackLabel} » sera définitivement supprimé, avec ses rushs, découpes et rendus. Cette
              action est irréversible.
            </p>
            {deleteError && <p className="text-sm text-[#8A2E1F]">{deleteError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={deleting}
                className="text-sm rounded-[10px] bg-white border border-border text-ink px-3 py-1.5 hover:bg-[#FAFAF8] transition disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="text-sm font-semibold rounded-[10px] bg-[#8A2E1F] text-white px-3 py-1.5 hover:brightness-110 transition disabled:opacity-50"
              >
                {deleting ? "Suppression..." : "Supprimer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
