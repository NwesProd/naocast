"use client";

import { useState } from "react";
import { MEDIA_ASSET_TYPES, previewKind, mediaAssetTypeLabel } from "@/lib/mediaAssets";

const pillBtn =
  "text-xs font-semibold rounded-pill bg-white border border-border px-3 py-1.5 hover:bg-[#FAFAF8] transition disabled:opacity-50 disabled:cursor-not-allowed";
const selectClass = "rounded-md border border-border bg-white px-2 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary-button/30";

export interface MediaAssetItem {
  id: string;
  name: string;
  type: string;
  mimeType: string;
  size: number;
  createdAt: string;
  url: string;
  downloadUrl: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

// Tableau de la bibliothèque de médias du podcast (logos, jingles, transitions,
// sons, musiques) : ajout avec choix du type, puis aperçu, téléchargement et
// suppression sur chaque ligne. Les fichiers sont lus par le connecteur Claude
// et les futurs montages pour retrouver un élément par son nom et son type.
export function MediaLibrary({ initialAssets }: { initialAssets: MediaAssetItem[] }) {
  const [assets, setAssets] = useState(initialAssets);
  const [newType, setNewType] = useState<string>("jingle");
  const [uploading, setUploading] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const data = new FormData();
      data.set("type", newType);
      data.set("file", file);
      const res = await fetch("/api/podcast/assets", { method: "POST", body: data });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Échec de l'envoi du média.");
      setAssets((list) => [body.asset as MediaAssetItem, ...list]);
      setPreviewId(body.asset.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function changeType(id: string, type: string) {
    const previous = assets;
    setAssets((list) => list.map((a) => (a.id === id ? { ...a, type } : a)));
    try {
      const res = await fetch(`/api/podcast/assets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setAssets(previous);
      setError("Échec du changement de type.");
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/podcast/assets/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setAssets((list) => list.filter((a) => a.id !== id));
      if (previewId === id) setPreviewId(null);
    } catch {
      setError("Échec de la suppression du média.");
    } finally {
      setConfirmDeleteId(null);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-ink">Médias</h2>
          <p className="text-sm text-text-muted">Logos, jingles, transitions, sons et musiques à réutiliser sur tes épisodes.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={newType} onChange={(e) => setNewType(e.target.value)} disabled={uploading} className={selectClass} aria-label="Type du média à ajouter">
            {MEDIA_ASSET_TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
          <label className={`${pillBtn} cursor-pointer`}>
            {uploading ? "Envoi..." : "+ Ajouter un média"}
            <input
              type="file"
              accept="audio/*,video/*,image/*"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) upload(f);
              }}
            />
          </label>
        </div>
      </div>

      {error && <p className="text-sm text-[#8A2E1F]">{error}</p>}

      <div className="overflow-x-auto rounded-md border border-border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-text-muted">
              <th className="px-3 py-2 font-medium">Nom</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Taille</th>
              <th className="px-3 py-2 font-medium">Ajouté le</th>
              <th className="px-3 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {assets.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-sm text-text-muted">
                  Aucun média pour le moment.
                </td>
              </tr>
            )}
            {assets.map((a) => {
              const kind = previewKind(a.mimeType);
              return (
                <tr key={a.id} className="border-b border-border last:border-b-0 align-top">
                  <td className="px-3 py-2 text-ink">
                    <span className="block max-w-[320px] truncate" title={a.name}>
                      {a.name}
                    </span>
                    {previewId === a.id && kind && (
                      <div className="mt-2">
                        {kind === "audio" ? (
                          <audio src={a.url} controls autoPlay className="h-10 w-full max-w-[420px]" />
                        ) : kind === "video" ? (
                          <video src={a.url} controls className="w-full max-w-[420px] rounded-md border border-border bg-black" />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element -- fichier utilisateur servi par URL signée
                          <img src={a.url} alt={a.name} className="max-h-48 rounded-md border border-border object-contain" />
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={a.type}
                      onChange={(e) => changeType(a.id, e.target.value)}
                      className={selectClass}
                      aria-label={`Type de ${a.name}`}
                    >
                      {MEDIA_ASSET_TYPES.some((t) => t.key === a.type) ? null : <option value={a.type}>{mediaAssetTypeLabel(a.type)}</option>}
                      {MEDIA_ASSET_TYPES.map((t) => (
                        <option key={t.key} value={t.key}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-text-muted whitespace-nowrap">{formatSize(a.size)}</td>
                  <td className="px-3 py-2 text-text-muted whitespace-nowrap">{formatDate(a.createdAt)}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {confirmDeleteId === a.id ? (
                        <>
                          <span className="text-xs text-text-muted">Supprimer ce média ?</span>
                          <button type="button" onClick={() => remove(a.id)} className={`${pillBtn} text-[#8A2E1F]`}>
                            Supprimer
                          </button>
                          <button type="button" onClick={() => setConfirmDeleteId(null)} className={pillBtn}>
                            Annuler
                          </button>
                        </>
                      ) : (
                        <>
                          {kind && (
                            <button type="button" onClick={() => setPreviewId(previewId === a.id ? null : a.id)} className={pillBtn}>
                              {previewId === a.id ? "Masquer" : "Aperçu"}
                            </button>
                          )}
                          <a href={a.downloadUrl} download={a.name} className={pillBtn}>
                            Télécharger
                          </a>
                          <button type="button" onClick={() => setConfirmDeleteId(a.id)} className={pillBtn}>
                            Supprimer
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
