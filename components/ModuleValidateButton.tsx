"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EPISODE_UPDATED_EVENT } from "@/components/SidebarNav";

// Bouton « Valider le module » (tick vert dans la sidebar, compte dans l'avancement de l'épisode).
// `autoDone` : le module est déjà validé automatiquement (rien à retirer).
export function ModuleValidateButton({ episodeId, module, initialDone, autoDone = false }: { episodeId: string; module: "extraits" | "diffusion" | "miniature"; initialDone: boolean; autoDone?: boolean }) {
  const router = useRouter();
  const [manual, setDone] = useState(initialDone);
  const done = manual || autoDone;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function set(next: boolean) {
    setDone(next);
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/episodes/${episodeId}/module-validation`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ module, done: next }) }).catch(() => null);
    setBusy(false);
    if (!res || !res.ok) {
      setDone(!next);
      setError("Validation impossible.");
      return;
    }
    window.dispatchEvent(new Event(EPISODE_UPDATED_EVENT));
    router.refresh();
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => !done && set(true)}
        className={`text-sm font-semibold rounded-[10px] px-4 py-2 transition ${done ? "bg-accent-teal text-white cursor-default" : "bg-primary-button text-white hover:brightness-110"}`}
      >
        {done ? "✓ Module validé" : "Valider le module"}
      </button>
      {manual && !autoDone && (
        <button type="button" disabled={busy} onClick={() => set(false)} className="text-xs text-text-muted underline">
          Retirer la validation
        </button>
      )}
      {error && <span className="text-xs text-[#8A2E1F]">{error}</span>}
    </div>
  );
}
