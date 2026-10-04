"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatBytes } from "../../ui";

// Bouton "Libérer l'espace" de la fiche utilisateur : supprime les fichiers inutiles,
// avec une confirmation dans la page (jamais confirm()).
export function StorageCleanup({ userId, files, bytes }: { userId: string; files: number; bytes: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/storage-cleanup`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Échec du nettoyage.");
      setMessage(`${data.deletedFiles} fichier${data.deletedFiles > 1 ? "s" : ""} supprimé${data.deletedFiles > 1 ? "s" : ""}, ${formatBytes(data.freedBytes)} libérés.`);
      setConfirming(false);
      router.refresh();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (files === 0) return message ? <p className="admin-message">{message}</p> : null;

  return (
    <div className="admin-row" style={{ marginBottom: 12 }}>
      {!confirming ? (
        <button type="button" className="admin-btn secondary" onClick={() => setConfirming(true)}>
          Libérer l&apos;espace ({formatBytes(bytes)})
        </button>
      ) : (
        <>
          <span className="admin-help">
            Supprimer définitivement {files} fichier{files > 1 ? "s" : ""} inutile{files > 1 ? "s" : ""} ({formatBytes(bytes)}) ?
          </span>
          <button type="button" className="admin-btn secondary" style={{ color: "var(--danger)" }} onClick={run} disabled={busy}>
            {busy ? "Suppression..." : "Oui, supprimer"}
          </button>
          <button type="button" className="admin-btn secondary" onClick={() => setConfirming(false)} disabled={busy}>
            Annuler
          </button>
        </>
      )}
      {message && <span className="admin-help">{message}</span>}
    </div>
  );
}
