"use client";

import { useState } from "react";
import { EPISODE_UPDATED_EVENT } from "@/components/SidebarNav";

const inputClass = "w-full rounded-md border border-border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-button/30";

// Module "Script" (catégorie Prod) : le brouillon de l'épisode (script
// complet, questions pour les invités, notes), enregistré à la sortie du
// champ puis validé quand il est prêt. Pour se faire aider, le connecteur
// Claude lit et écrit ce brouillon (cf. lib/mcp/server.ts, save_script).
export function ScriptModuleClient({
  episodeId,
  initialScriptDraft,
  initialScriptValidated,
}: {
  episodeId: string;
  initialScriptDraft: string;
  initialScriptValidated: boolean;
}) {
  const [scriptDraft, setScriptDraft] = useState(initialScriptDraft);
  const [validated, setValidated] = useState(initialScriptValidated);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveDraft(value: string) {
    try {
      await fetch(`/api/episodes/${episodeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptDraft: value }),
      });
    } catch {
      setError("Échec de l'enregistrement du script.");
    }
  }

  async function validateScript(next = true) {
    setValidating(true);
    setError(null);
    try {
      const res = await fetch(`/api/episodes/${episodeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptDraft, scriptValidated: next }),
      });
      if (!res.ok) throw new Error();
      setValidated(next);
      window.dispatchEvent(new Event(EPISODE_UPDATED_EVENT));
    } catch {
      setError(next ? "Échec de la validation du script." : "Impossible de retirer la validation.");
    } finally {
      setValidating(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-ink">Script</h1>
          <p className="text-sm text-text-muted">Écris le script de cet épisode, ses questions ou de simples notes.</p>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={() => !validated && validateScript(true)}
            disabled={validating}
            className={`text-sm font-semibold rounded-[10px] px-4 py-2 transition disabled:opacity-50 ${
              validated ? "bg-accent-teal text-white cursor-default" : "bg-primary-button text-white hover:brightness-110"
            }`}
          >
            {validating ? "..." : validated ? "✓ Script validé" : "Valider mon script"}
          </button>
          {validated && (
            <button type="button" onClick={() => validateScript(false)} disabled={validating} className="text-xs text-text-muted underline disabled:opacity-50">
              Retirer la validation
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-[#8A2E1F]">{error}</p>}

      <div className="rounded-xl bg-white border border-border p-5 space-y-3">
        <label className="block text-sm font-medium mb-1.5 text-ink">Mon script</label>
        <textarea
          value={scriptDraft}
          onChange={(e) => setScriptDraft(e.target.value)}
          onBlur={(e) => saveDraft(e.target.value)}
          rows={16}
          placeholder="Écris librement..."
          className={inputClass}
        />
      </div>
    </div>
  );
}
