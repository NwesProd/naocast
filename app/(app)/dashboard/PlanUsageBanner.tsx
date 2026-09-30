import Link from "next/link";
import type { EpisodeUsage } from "@/lib/entitlements";

// Bandeau d'état du forfait sur le dashboard : où en est l'utilisateur par
// rapport à sa limite d'épisodes, avec un lien vers /billing pour upgrader.
export function PlanUsageBanner({ usage }: { usage: EpisodeUsage }) {
  const nearLimit = usage.limit !== null && usage.used >= usage.limit;

  return (
    <div
      className={`mb-6 flex items-center justify-between rounded-xl border px-4 py-3 text-sm ${
        nearLimit ? "border-[#8A2E1F]/30 bg-[#8A2E1F]/5 text-[#8A2E1F]" : "border-border bg-white text-text-muted"
      }`}
    >
      <p>
        <span className="font-semibold text-ink">{usage.planLabel}</span>
        {usage.limit === null
          ? " · épisodes illimités"
          : ` · ${usage.used}/${usage.limit} épisode${usage.limit > 1 ? "s" : ""} ${usage.periodLabel}`}
      </p>
      <Link href="/billing" className="font-semibold underline shrink-0 ml-4">
        {nearLimit ? "Passer à un forfait supérieur" : "Gérer mon forfait"}
      </Link>
    </div>
  );
}
