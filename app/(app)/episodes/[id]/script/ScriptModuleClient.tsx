"use client";

import Link from "next/link";
import { useState } from "react";
import { useSimulatedProgress } from "@/lib/useSimulatedProgress";
import { EPISODE_UPDATED_EVENT } from "@/components/SidebarNav";

const pillBtn =
  "text-xs font-semibold rounded-pill bg-white border border-border px-3 py-1.5 hover:bg-[#FAFAF8] transition disabled:opacity-50 disabled:cursor-not-allowed";
const inputClass = "w-full rounded-md border border-border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-button/30";

// Module "Script" (catégorie Prod) : propose des idées d'angles/thèmes pour
// l'épisode à partir de la bible du podcast, de ses invités déjà ajoutés
// (s'il y en a) et, si présent, du brouillon écrit dans "Écrire mon
// script" ; cliquer une idée l'envoie dans ce brouillon pour l'étoffer,
// écrire un script complet ou des questions.
export function ScriptModuleClient({
  episodeId,
  hasBible,
  guestNames,
  initialIdeas,
  initialScriptDraft,
  initialScriptValidated,
}: {
  episodeId: string;
  hasBible: boolean;
  guestNames: string[];
  initialIdeas: string[];
  initialScriptDraft: string;
  initialScriptValidated: boolean;
}) {
  const [ideas, setIdeas] = useState<string[]>(initialIdeas);
  const [generating, setGenerating] = useState(false);
  const [selectedIdea, setSelectedIdea] = useState<number | null>(null);
  // Une fois une idée choisie, les autres se replient (le champ "Écrire mon
  // script" remonte, moins de défilement) : "Voir les autres idées" les
  // rouvre sans perdre la sélection ni le brouillon déjà envoyé.
  const [showAllIdeas, setShowAllIdeas] = useState(true);

  const [scriptDraft, setScriptDraft] = useState(initialScriptDraft);
  const [generatingFromDraft, setGeneratingFromDraft] = useState(false);

  const [validated, setValidated] = useState(initialScriptValidated);
  const [validating, setValidating] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const progress = useSimulatedProgress(generating);
  const progressFromDraft = useSimulatedProgress(generatingFromDraft);

  async function requestIdeas(draftNotes: string | undefined, setLoading: (v: boolean) => void) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/episodes/${episodeId}/script-ideas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftNotes }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: undefined }));
        throw new Error(body.error || "Échec de la génération des idées.");
      }
      const data = await res.json();
      setIdeas((data.scriptAngleIdeas as string[] | null) ?? []);
      setSelectedIdea(null);
      setShowAllIdeas(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function selectIdea(index: number) {
    setSelectedIdea(index);
    setShowAllIdeas(false);
    setScriptDraft((draft) => (draft.trim() ? `${draft}\n\n${ideas[index]}` : ideas[index]));
  }

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
          <p className="text-sm text-text-muted">Idées d&apos;angles et de thèmes pour cet épisode, basées sur la bible du podcast.</p>
        </div>
        {hasBible && (
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
        )}
      </div>

      {error && <p className="text-sm text-[#8A2E1F]">{error}</p>}

      {!hasBible ? (
        <div className="rounded-xl bg-mint p-5 space-y-2">
          <p className="text-sm text-mint-ink">
            Complète d&apos;abord la bible de ton podcast pour que Claude puisse proposer des idées pertinentes.
          </p>
          <Link href="/podcast" className={pillBtn}>
            Aller à l&apos;onglet ADN
          </Link>
        </div>
      ) : (
        <>
          {!validated && (
            <div className="rounded-xl bg-mint p-5 space-y-4">
              {guestNames.length > 0 && (
                <p className="text-xs text-mint-ink">
                  Basé sur la bible du podcast et {guestNames.length > 1 ? "les invités" : "l'invité"} de cet
                  épisode : {guestNames.join(", ")}.
                </p>
              )}

              <button
                type="button"
                onClick={() => requestIdeas(undefined, setGenerating)}
                disabled={generating}
                className="text-sm font-semibold rounded-[10px] bg-primary-button text-white px-4 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {generating
                  ? `Génération en cours... ${progress}%`
                  : ideas.length > 0
                    ? "Régénérer des idées"
                    : "Proposer des idées"}
              </button>

              {ideas.length > 0 && (
                <ul className="space-y-2">
                  {ideas.map((idea, i) => {
                    if (!showAllIdeas && selectedIdea !== null && i !== selectedIdea) return null;
                    const [title, ...rest] = idea.split(":");
                    const description = rest.join(":").trim();
                    const selected = selectedIdea === i;
                    return (
                      <li key={i}>
                        <button
                          type="button"
                          onClick={() => selectIdea(i)}
                          className={`w-full text-left rounded-md border p-3 transition ${
                            selected ? "border-primary-button bg-peach/40" : "border-border bg-white hover:bg-[#FAFAF8]"
                          }`}
                        >
                          <p className="text-sm font-semibold text-ink">{description ? title.trim() : idea}</p>
                          {description && <p className="text-sm text-text-muted mt-0.5">{description}</p>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {!showAllIdeas && selectedIdea !== null && (
                <button type="button" onClick={() => setShowAllIdeas(true)} className={pillBtn}>
                  Voir les autres idées
                </button>
              )}
            </div>
          )}

          <div className="rounded-xl bg-white border border-border p-5 space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1.5 text-ink">Écrire mon script</label>
              <p className="text-xs text-text-muted mb-2">
                {validated
                  ? "Script validé : retire la validation pour proposer de nouvelles idées."
                  : "Clique une idée ci-dessus pour l'envoyer ici, puis étoffe-la : script complet, questions pour les invités, simples notes..."}
              </p>
              <textarea
                value={scriptDraft}
                onChange={(e) => setScriptDraft(e.target.value)}
                onBlur={(e) => saveDraft(e.target.value)}
                rows={12}
                placeholder="Écris librement..."
                className={inputClass}
              />
            </div>
            {!validated && (
              <button
                type="button"
                onClick={() => requestIdeas(scriptDraft, setGeneratingFromDraft)}
                disabled={generatingFromDraft || !scriptDraft.trim()}
                className={pillBtn}
              >
                {generatingFromDraft
                  ? `Génération en cours... ${progressFromDraft}%`
                  : "Générer des angles à partir des idées"}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
