"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface CreditRow {
  id: string;
  amount: number;
  reason: string | null;
  by: string;
  date: string;
}

// "Créditer un épisode gratuit" + historique des crédits déjà accordés à cet utilisateur.
export function EpisodeCreditCard({ userId, credits, total }: { userId: string; credits: CreditRow[]; total: number }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function credit() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/episode-credit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 1, reason: reason.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Le crédit a échoué.");
      setReason("");
      setMessage({ type: "success", text: "Un épisode gratuit a été crédité." });
      router.refresh();
    } catch (err) {
      setMessage({ type: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-card">
      <h2 className="admin-section-title">épisodes offerts</h2>
      <p className="admin-help" style={{ marginTop: -4, marginBottom: 12 }}>
        Chaque crédit s&apos;ajoute à la limite d&apos;épisodes du forfait, sans paiement. Total offert : {total}.
      </p>

      {message && (
        <p className={`admin-message ${message.type}`} role="status">
          {message.text}
        </p>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <input
          className="admin-input"
          style={{ flex: 1, minWidth: 200 }}
          placeholder="Motif (facultatif) : geste commercial, testeur..."
          value={reason}
          maxLength={300}
          onChange={(e) => setReason(e.target.value)}
        />
        <button type="button" className="admin-btn blue" disabled={busy} onClick={credit}>
          {busy ? "Crédit..." : "Créditer un épisode gratuit"}
        </button>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Date</th>
              <th className="num">Épisodes</th>
              <th>Motif</th>
              <th>Par</th>
            </tr>
          </thead>
          <tbody>
            {credits.length === 0 && (
              <tr>
                <td colSpan={4} className="admin-empty">
                  Aucun épisode offert pour le moment.
                </td>
              </tr>
            )}
            {credits.map((c) => (
              <tr key={c.id}>
                <td>{c.date}</td>
                <td className="num">+{c.amount}</td>
                <td>{c.reason ?? "-"}</td>
                <td>{c.by}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
