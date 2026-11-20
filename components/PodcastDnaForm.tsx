"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";

const inputClass = "w-full rounded-md border border-border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-button/30";
const pillBtn =
  "text-xs font-semibold rounded-pill bg-white border border-border px-3 py-1.5 hover:bg-[#FAFAF8] transition disabled:opacity-50 disabled:cursor-not-allowed";

interface ExistingDna {
  title: string;
  dna: string;
  bible: string;
}

// Onglet "ADN" (Mon podcast) : titre, positionnement en texte libre (guidé
// par des questions suggérées) et bible du podcast, à rédiger à la main. Le
// connecteur Claude lit l'ADN et la bible pour garder le ton du podcast.
export function PodcastDnaForm({
  existing,
  onFirstSave,
}: {
  existing?: ExistingDna;
  onFirstSave?: () => void;
}) {
  const router = useRouter();
  // Capturé une seule fois au montage : reste vrai après le tout premier
  // enregistrement (le prop `existing` ne se met à jour qu'au prochain rendu
  // serveur), permettant de basculer vers l'onglet Graphisme une seule fois.
  const [isFirstSave] = useState(!existing);
  const [title, setTitle] = useState(existing?.title || "");
  const [dna, setDna] = useState(existing?.dna || "");
  const [bible, setBible] = useState(existing?.bible || "");
  const [draftBible, setDraftBible] = useState(existing?.bible || "");

  const [editingBible, setEditingBible] = useState(!existing?.bible);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savingTitle, setSavingTitle] = useState(false);
  const [savedTitle, setSavedTitle] = useState(false);
  const [savingBible, setSavingBible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function saveDna(form: HTMLFormElement) {
    const data = new FormData(form);
    const res = await fetch("/api/podcast/dna", { method: "POST", body: data });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: undefined }));
      throw new Error(body.error || "Échec de l'enregistrement.");
    }
    return res.json();
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await saveDna(e.currentTarget);
      setSaved(true);
      if (isFirstSave) onFirstSave?.();
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // Enregistrement rapide du seul titre, sans passer par le reste du
  // formulaire (ADN, documents) ni forcément l'avoir sous les yeux (repliés
  // une fois la bible générée).
  async function saveTitleOnly() {
    setSavingTitle(true);
    setSavedTitle(false);
    setError(null);
    try {
      const data = new FormData();
      data.set("title", title);
      const res = await fetch("/api/podcast/dna", { method: "POST", body: data });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: undefined }));
        throw new Error(body.error || "Échec de l'enregistrement.");
      }
      setSavedTitle(true);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingTitle(false);
    }
  }

  async function deletePodcast() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/podcast", { method: "DELETE" });
      if (!res.ok) throw new Error();
      router.push("/");
      router.refresh();
    } catch {
      setError("Échec de la suppression du podcast.");
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  async function saveBible() {
    setSavingBible(true);
    setError(null);
    try {
      const res = await fetch("/api/podcast/bible", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bible: draftBible }),
      });
      if (!res.ok) throw new Error();
      setBible(draftBible);
      setEditingBible(false);
    } catch {
      setError("Échec de l'enregistrement de la bible.");
    } finally {
      setSavingBible(false);
    }
  }

  return (
    <div className="space-y-8">
      <form
        id="podcast-dna-form"
        onSubmit={handleSave}
        onChange={() => setSaved(false)}
        className="space-y-8"
      >
        {error && <p className="text-sm text-[#8A2E1F]">{error}</p>}
        {saved && <p className="text-sm text-[#0F6B67]">Tout est enregistré.</p>}

        <div>
          <label className="block text-sm font-medium mb-1.5 text-ink">Titre du podcast</label>
          <div className="flex items-center gap-2">
            <input
              name="title"
              required
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setSavedTitle(false);
              }}
              className={`${inputClass} max-w-md`}
            />
            <button type="button" onClick={saveTitleOnly} disabled={savingTitle} className={pillBtn}>
              {savingTitle ? "Enregistrement..." : "Enregistrer"}
            </button>
            {savedTitle && <span className="text-xs text-[#0F6B67]">Enregistré.</span>}
            {!isFirstSave && (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="ml-auto text-xs font-semibold rounded-pill bg-[#8A2E1F] text-white px-3 py-1.5 hover:bg-[#732619] transition"
              >
                Supprimer le podcast
              </button>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5 text-ink">ADN du podcast (facultatif)</label>
          <p className="text-xs text-text-muted mb-2">
            Quelques questions pour t&apos;aider à le décrire : c&apos;est quoi ? Ça s&apos;adresse à qui ? Pourquoi ce
            podcast existe ? Quelle ligne éditoriale ? Y a-t-il des règles à respecter ?
          </p>
          <textarea
            name="dna"
            value={dna}
            onChange={(e) => setDna(e.target.value)}
            rows={8}
            placeholder="Écris librement, pas besoin de répondre point par point..."
            className={inputClass}
          />
        </div>
      </form>

      <div className="rounded-xl bg-mint p-5 space-y-3">
        <h2 className="font-medium text-mint-ink text-sm">Bible du podcast</h2>
        {editingBible ? (
          <>
            <textarea
              value={draftBible}
              onChange={(e) => setDraftBible(e.target.value)}
              rows={20}
              placeholder="Ton, public, format, règles éditoriales..."
              className={`${inputClass} bg-white font-mono text-sm`}
            />
            <div className="flex gap-2">
              <button type="button" onClick={saveBible} disabled={savingBible} className={pillBtn}>
                {savingBible ? "Enregistrement..." : "Enregistrer la bible"}
              </button>
              {bible && (
                <button type="button" onClick={() => setEditingBible(false)} className={pillBtn}>
                  Annuler
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <pre className="whitespace-pre-wrap font-mono text-sm text-ink bg-white rounded-md border border-border p-4">
              {bible}
            </pre>
            <button
              type="button"
              onClick={() => {
                setDraftBible(bible);
                setEditingBible(true);
              }}
              className={pillBtn}
            >
              Modifier la bible
            </button>
          </>
        )}
      </div>

      <Button type="submit" form="podcast-dna-form" disabled={saving} variant="secondary" className="w-full max-w-md">
        {saving ? "Enregistrement..." : "Enregistrer"}
      </Button>

      {confirmingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 space-y-4">
            <p className="text-sm text-ink">
              Êtes-vous sûr de vouloir supprimer votre podcast ? Les données seront définitivement supprimées.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmingDelete(false)} disabled={deleting} className={pillBtn}>
                Annuler
              </button>
              <button
                type="button"
                onClick={deletePodcast}
                disabled={deleting}
                className="text-xs font-semibold rounded-pill bg-[#8A2E1F] text-white px-3 py-1.5 hover:bg-[#732619] transition disabled:opacity-50"
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
