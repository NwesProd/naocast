"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const inputClass = "w-full rounded-md border border-border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-button/30";
const BIBLE_PLACEHOLDER =
  "Tu peux écrire ici : quelques questions pour t'aider à décrire ton podcast.\nC'est quoi ? Ça s'adresse à qui ? Pourquoi ce podcast existe ? Quelle ligne éditoriale ? Y a-t-il des règles à respecter ?";
const pillBtn =
  "text-xs font-semibold rounded-pill bg-white border border-border px-3 py-1.5 hover:bg-[#FAFAF8] transition disabled:opacity-50 disabled:cursor-not-allowed";

interface BibleDocument {
  key: string;
  filename: string;
  mimeType: string;
  text: string | null;
  url: string;
}

interface ExistingDna {
  title: string;
  bible: string;
  documents: BibleDocument[];
}

// Onglet "Paramètres" (Mon podcast) : titre et bible du podcast, en texte
// libre et/ou en documents (PDF, Word, texte, Markdown). Le connecteur Claude
// lit la bible et le texte des documents pour garder le ton du podcast.
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
  // serveur), permettant de basculer vers l'onglet Bibliothèque de médias une seule fois.
  const [isFirstSave] = useState(!existing);
  const [title, setTitle] = useState(existing?.title || "");
  const [bible, setBible] = useState(existing?.bible || "");
  const [draftBible, setDraftBible] = useState(existing?.bible || "");

  const [editingBible, setEditingBible] = useState(false);
  const [documents, setDocuments] = useState<BibleDocument[]>(existing?.documents || []);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null); // "new" ou la clé du document remplacé
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
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

  async function uploadDocument(file: File, replaceKey?: string) {
    setUploadingKey(replaceKey ?? "new");
    setError(null);
    try {
      const data = new FormData();
      if (replaceKey) data.set("replaceKey", replaceKey);
      data.set("file", file);
      const res = await fetch("/api/podcast/bible/files", { method: "POST", body: data });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Échec de l'envoi du document.");
      const doc = body.file as BibleDocument;
      setDocuments((docs) => (replaceKey ? docs.map((d) => (d.key === replaceKey ? doc : d)) : [...docs, doc]));
      setPreviewKey(doc.key);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploadingKey(null);
    }
  }

  async function removeDocument(key: string) {
    setError(null);
    try {
      const res = await fetch("/api/podcast/dna/reference-files", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      if (!res.ok) throw new Error();
      setDocuments((docs) => docs.filter((d) => d.key !== key));
      if (previewKey === key) setPreviewKey(null);
    } catch {
      setError("Échec de la suppression du document.");
    } finally {
      setConfirmDeleteKey(null);
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

        <div>
          <label className="block text-sm font-medium mb-1.5 text-ink">Titre du podcast</label>
          <div className="flex items-center gap-2">
            <input
              name="title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={`${inputClass} max-w-md`}
            />
            <button type="submit" disabled={saving} className={pillBtn}>
              {saving ? "Enregistrement..." : "Enregistrer"}
            </button>
            {saved && <span className="text-xs text-[#0F6B67]">Enregistré.</span>}
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
      </form>

      <div className="rounded-xl bg-mint p-5 space-y-3">
        <h2 className="font-medium text-mint-ink text-sm">Bible du podcast</h2>
        {editingBible || !bible ? (
          <>
            <textarea
              value={draftBible}
              onChange={(e) => setDraftBible(e.target.value)}
              rows={14}
              placeholder={BIBLE_PLACEHOLDER}
              className={`${inputClass} bg-white text-sm`}
            />
            <div className="flex gap-2">
              <button type="button" onClick={saveBible} disabled={savingBible} className={pillBtn}>
                {savingBible ? "Enregistrement..." : "Enregistrer"}
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
            <pre className="whitespace-pre-wrap font-sans text-sm text-ink bg-white rounded-md border border-border p-4">
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

        <div className="border-t border-border pt-3 space-y-2">
          <p className="text-xs font-medium text-mint-ink">Documents (PDF, Word, .txt ou .md)</p>
          {documents.map((d) => {
            const isPdf = d.filename.toLowerCase().endsWith(".pdf");
            return (
              <div key={d.key} className="rounded-md border border-border bg-white">
                <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <span className="text-sm text-ink truncate flex-1 min-w-0">{d.filename}</span>
                  {confirmDeleteKey === d.key ? (
                    <>
                      <span className="text-xs text-text-muted">Supprimer ce document ?</span>
                      <button type="button" onClick={() => removeDocument(d.key)} className={`${pillBtn} text-[#8A2E1F]`}>
                        Supprimer
                      </button>
                      <button type="button" onClick={() => setConfirmDeleteKey(null)} className={pillBtn}>
                        Annuler
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => setPreviewKey(previewKey === d.key ? null : d.key)} className={pillBtn}>
                        {previewKey === d.key ? "Masquer" : "Aperçu"}
                      </button>
                      <label className={`${pillBtn} cursor-pointer`}>
                        {uploadingKey === d.key ? "Envoi..." : "Remplacer"}
                        <input
                          type="file"
                          accept=".pdf,.docx,.txt,.md"
                          className="hidden"
                          disabled={uploadingKey !== null}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.target.value = "";
                            if (f) uploadDocument(f, d.key);
                          }}
                        />
                      </label>
                      <button type="button" onClick={() => setConfirmDeleteKey(d.key)} className={pillBtn}>
                        Supprimer
                      </button>
                    </>
                  )}
                </div>
                {previewKey === d.key && (
                  <div className="border-t border-border p-3">
                    {isPdf ? (
                      <iframe src={d.url} title={d.filename} className="w-full h-[480px] rounded-md border border-border" />
                    ) : d.text ? (
                      <pre className="whitespace-pre-wrap font-sans text-sm text-ink max-h-[480px] overflow-y-auto">{d.text}</pre>
                    ) : (
                      <p className="text-xs text-text-muted">Aperçu indisponible pour ce fichier.</p>
                    )}
                    <a href={d.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-accent-teal hover:underline">
                      Ouvrir dans un nouvel onglet
                    </a>
                  </div>
                )}
              </div>
            );
          })}
          <label className={`${pillBtn} inline-block cursor-pointer`}>
            {uploadingKey === "new" ? "Envoi..." : documents.length > 0 ? "+ Ajouter un document" : "Importer un document"}
            <input
              type="file"
              accept=".pdf,.docx,.txt,.md"
              className="hidden"
              disabled={uploadingKey !== null}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) uploadDocument(f);
              }}
            />
          </label>
        </div>
      </div>

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
