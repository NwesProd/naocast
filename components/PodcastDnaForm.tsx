"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { useSimulatedProgress } from "@/lib/useSimulatedProgress";

const inputClass = "w-full rounded-md border border-border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-button/30";
const fileInputClass =
  "text-sm text-text-muted file:mr-3 file:cursor-pointer file:rounded-[10px] file:border file:border-border file:bg-white file:px-4 file:py-2 file:text-sm file:font-semibold file:text-ink hover:file:bg-[#FAFAF8]";
const pillBtn =
  "text-xs font-semibold rounded-pill bg-white border border-border px-3 py-1.5 hover:bg-[#FAFAF8] transition disabled:opacity-50 disabled:cursor-not-allowed";

interface ReferenceFile {
  key: string;
  filename: string;
  url: string;
}

interface ExistingDna {
  title: string;
  dna: string;
  referenceFiles: ReferenceFile[];
  bible: string;
}

// Onglet "ADN" (Mon podcast) : titre + positionnement en texte libre (guidé
// par des questions suggérées) + documents de référence, à partir desquels
// Claude génère une bible du podcast, modifiable ensuite à la main.
export function PodcastDnaForm({ existing }: { existing?: ExistingDna }) {
  const router = useRouter();
  const [title, setTitle] = useState(existing?.title || "");
  const [dna, setDna] = useState(existing?.dna || "");
  const [referenceFiles, setReferenceFiles] = useState<ReferenceFile[]>(existing?.referenceFiles || []);
  const [bible, setBible] = useState(existing?.bible || "");
  const [draftBible, setDraftBible] = useState(existing?.bible || "");

  // Une fois une bible générée, l'ADN et les documents de référence se
  // replient (plus besoin d'y revenir à chaque visite) : "Ajouter des
  // éléments" les rouvre pour compléter puis régénérer.
  const [showAdnFields, setShowAdnFields] = useState(!existing?.bible);
  const [editingBible, setEditingBible] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savingTitle, setSavingTitle] = useState(false);
  const [savedTitle, setSavedTitle] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [savingBible, setSavingBible] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bibleProgress = useSimulatedProgress(generating);

  async function saveDna(form: HTMLFormElement): Promise<{ referenceFiles: ReferenceFile[] } | null> {
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

  async function removeReferenceFile(key: string) {
    setError(null);
    const prev = referenceFiles;
    setReferenceFiles((files) => files.filter((f) => f.key !== key));
    try {
      const res = await fetch("/api/podcast/dna/reference-files", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setReferenceFiles(prev);
      setError("Échec de la suppression du document.");
    }
  }

  async function generateBible(form: HTMLFormElement) {
    setGenerating(true);
    setError(null);
    try {
      // Le texte ADN et les documents fraîchement ajoutés doivent être
      // enregistrés avant la génération, qui lit tout depuis la base.
      await saveDna(form);
      const res = await fetch("/api/podcast/bible", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: undefined }));
        throw new Error(body.error || "Échec de la génération de la bible.");
      }
      const data = await res.json();
      setBible(data.bible || "");
      setDraftBible(data.bible || "");
      setShowAdnFields(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGenerating(false);
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
          </div>
        </div>

        {showAdnFields && (
          <>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-ink">ADN du podcast</label>
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

            <div>
              <label className="block text-sm font-medium mb-1.5 text-ink">Documents de référence</label>
              <p className="text-xs text-text-muted mb-2">
                Une bible existante, des notes... (.pdf, .txt ou .md), utilisés en plus du texte ci-dessus pour générer la
                bible.
              </p>
              <div className="space-y-2">
                {referenceFiles.map((f) => (
                  <div key={f.key} className="flex items-center gap-2 rounded-md border border-border bg-white px-3 py-2">
                    <a href={f.url} target="_blank" rel="noreferrer" className="text-sm text-accent-teal hover:underline truncate flex-1">
                      {f.filename}
                    </a>
                    <button
                      type="button"
                      onClick={() => removeReferenceFile(f.key)}
                      className="shrink-0 text-text-muted hover:text-[#8A2E1F] p-1"
                      title="Retirer ce document"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                ))}
                <input
                  name="referenceFiles"
                  type="file"
                  multiple
                  accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
                  className={fileInputClass}
                />
              </div>
            </div>
          </>
        )}

        {showAdnFields && (
          <div className="flex gap-3">
            <Button
              type="button"
              disabled={generating}
              onClick={(e) => generateBible(e.currentTarget.form as HTMLFormElement)}
            >
              {generating
                ? `Génération en cours... ${bibleProgress}%`
                : bible
                  ? "Régénérer la bible"
                  : "Générer la bible"}
            </Button>
          </div>
        )}
      </form>

      {bible && (
        <div className="rounded-xl bg-mint p-5 space-y-3">
          <h2 className="font-medium text-mint-ink text-sm">Bible du podcast</h2>
          {editingBible ? (
            <>
              <textarea
                value={draftBible}
                onChange={(e) => setDraftBible(e.target.value)}
                rows={20}
                className={`${inputClass} bg-white font-mono text-sm`}
              />
              <div className="flex gap-2">
                <button type="button" onClick={saveBible} disabled={savingBible} className={pillBtn}>
                  {savingBible ? "Enregistrement..." : "Enregistrer"}
                </button>
                <button type="button" onClick={() => setEditingBible(false)} className={pillBtn}>
                  Annuler
                </button>
              </div>
            </>
          ) : (
            <>
              <pre className="whitespace-pre-wrap font-mono text-sm text-ink bg-white rounded-md border border-border p-4">
                {bible}
              </pre>
              <div className="flex gap-2">
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
                {!showAdnFields && (
                  <button type="button" onClick={() => setShowAdnFields(true)} className={pillBtn}>
                    Ajouter des éléments
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      <Button type="submit" form="podcast-dna-form" disabled={saving} variant="secondary" className="w-full max-w-md">
        {saving ? "Enregistrement..." : "Enregistrer"}
      </Button>
    </div>
  );
}
