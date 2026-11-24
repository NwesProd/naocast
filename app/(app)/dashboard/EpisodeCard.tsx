"use client";

import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";
import { EpisodeActions } from "./EpisodeActions";

// Couleurs de zone selon la catégorie de statut (brouillon / en traitement /
// validé) plutôt qu'un fond unique, le badge (toujours en ton plein) reste
// le seul indicateur précis du statut exact.
const ZONE_CLASSES: Record<string, { bg: string; text: string; muted: string }> = {
  DRAFT: { bg: "bg-[#EEEAE4]", text: "text-[#57524B]", muted: "text-[#57524B]/70" },
  PROD: { bg: "bg-butter", text: "text-butter-ink", muted: "text-butter-ink/70" },
  POST_PROD: { bg: "bg-[#DCEBE9]", text: "text-[#0F4F4C]", muted: "text-[#0F4F4C]/70" },
  QUEUED: { bg: "bg-butter", text: "text-butter-ink", muted: "text-butter-ink/70" },
  PROCESSING: { bg: "bg-butter", text: "text-butter-ink", muted: "text-butter-ink/70" },
  HUMAN_EDITOR_REQUESTED: { bg: "bg-sky", text: "text-sky-ink", muted: "text-sky-ink/70" },
  READY_FOR_REVIEW: { bg: "bg-mint", text: "text-mint-ink", muted: "text-mint-muted" },
  EXPORTED: { bg: "bg-[#E3E7E9]", text: "text-[#1F2A2E]", muted: "text-[#1F2A2E]/70" },
  READY_TO_PUBLISH: { bg: "bg-[#DDEFE3]", text: "text-[#1F5C3A]", muted: "text-[#1F5C3A]/70" },
  PUBLISHED: { bg: "bg-[#E3E7E9]", text: "text-[#1F2A2E]", muted: "text-[#1F2A2E]/70" },
  FAILED: { bg: "bg-[#FBEAE7]", text: "text-[#8A2E1F]", muted: "text-[#8A2E1F]/70" },
};
const DEFAULT_ZONE = ZONE_CLASSES.DRAFT;

interface EpisodeCardProps {
  id: string;
  title: string | null;
  status: string;
  // Statut affiché (badge, couleur) : peut être "Prêt à diffuser" / "Diffusé" une fois tout
  // validé (cf. displayStatus). `status` reste le statut réel, utilisé pour la logique.
  displayStatus: string;
  // Modules validés sur modules du forfait (cf. episodeProgress).
  progress: { done: number; total: number };
  season: number | null;
  episodeNumber: number | null;
  releaseDateLabel: string | null;
  fallbackLabel: string;
  // Free et basic : un épisode validé ne peut plus être supprimé (cf. lib/plan.ts).
  deletionLockedWhenValidated: boolean;
}

export function EpisodeCard({
  id,
  title,
  status,
  displayStatus,
  progress,
  season,
  episodeNumber,
  releaseDateLabel,
  fallbackLabel,
  deletionLockedWhenValidated,
}: EpisodeCardProps) {
  const zone = ZONE_CLASSES[displayStatus] || DEFAULT_ZONE;
  const sn = [season != null ? `S${season}` : null, episodeNumber != null ? `E${episodeNumber}` : null]
    .filter(Boolean)
    .join("");

  // Ouvre le premier module non validé auquel le forfait donne accès : la décision se prend
  // côté serveur (cf. app/(app)/episodes/[id]/start/page.tsx), avec le forfait de l'utilisateur.
  const href = `/episodes/${id}/start`;

  return (
    <div className={`relative rounded-xl ${zone.bg} min-h-[132px]`}>
      <Link href={href} className="flex flex-col justify-between gap-4 h-full p-5 hover:brightness-95 transition rounded-xl">
        <div className="pr-14">
          {sn && <p className={`text-xs font-semibold ${zone.muted} mb-1`}>{sn}</p>}
          <p className={`font-medium ${zone.text} line-clamp-2`}>{title || fallbackLabel}</p>
          {releaseDateLabel && <p className={`text-xs ${zone.muted} mt-1`}>Sortie le {releaseDateLabel}</p>}
        </div>
        <div className="space-y-2">
          <div className={`flex items-center gap-2 text-xs ${zone.muted}`} title={`${progress.done} module${progress.done > 1 ? "s" : ""} validé${progress.done > 1 ? "s" : ""} sur ${progress.total}`}>
            <span className="h-1.5 flex-1 overflow-hidden rounded-pill bg-black/10">
              <span className={`block h-full rounded-pill bg-current ${zone.text}`} style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
            </span>
            <span className="tabular-nums">{progress.done}/{progress.total}</span>
          </div>
          <StatusBadge status={displayStatus} />
        </div>
      </Link>

      <div className="absolute top-3 right-3">
        <EpisodeActions
          id={id}
          title={title}
          fallbackLabel={fallbackLabel}
          status={status}
          deletionLockedWhenValidated={deletionLockedWhenValidated}
          gearClassName={zone.text}
        />
      </div>
    </div>
  );
}
