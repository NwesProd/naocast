"use client";

import { useState } from "react";

type Segment = "ALL" | "PAID" | "FREE" | "BASIC" | "INFINITY" | "LIFETIME";

const SEGMENTS: { value: Segment; label: string }[] = [
  { value: "ALL", label: "Tous les utilisateurs" },
  { value: "PAID", label: "Abonnés payants (basic, infinity, lifetime)" },
  { value: "FREE", label: "naocast free" },
  { value: "BASIC", label: "naocast basic" },
  { value: "INFINITY", label: "naocast infinity" },
  { value: "LIFETIME", label: "naocast lifetime" },
];

export function EmailsClient({ adminEmail }: { adminEmail: string }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [segment, setSegment] = useState<Segment>("ALL");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmCount, setConfirmCount] = useState<number | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const ready = subject.trim().length > 0 && body.trim().length > 0;

  async function call(url: string, payload: unknown) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "L'action a échoué.");
    return data as { sentTo?: string; count?: number };
  }

  async function sendTest() {
    setBusy("test");
    setMessage(null);
    try {
      const data = await call("/api/admin/emails/test", { subject, body });
      setMessage({ type: "success", text: `Mail de test envoyé à ${data.sentTo ?? adminEmail}.` });
    } catch (err) {
      setMessage({ type: "error", text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  // Étape 1 : compte les destinataires et demande confirmation dans la page.
  async function prepareBroadcast() {
    setBusy("prepare");
    setMessage(null);
    try {
      const data = await call("/api/admin/emails/broadcast", { subject, body, segment, dryRun: true });
      setConfirmCount(data.count ?? 0);
    } catch (err) {
      setMessage({ type: "error", text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  // Étape 2 : envoi réel après confirmation.
  async function confirmBroadcast() {
    setBusy("send");
    setMessage(null);
    try {
      const data = await call("/api/admin/emails/broadcast", { subject, body, segment, dryRun: false });
      setMessage({ type: "success", text: `Envoyé à ${data.count} personne${(data.count ?? 0) > 1 ? "s" : ""}.` });
      setConfirmCount(null);
      setSubject("");
      setBody("");
    } catch (err) {
      setMessage({ type: "error", text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="admin-card">
      <h2 className="admin-section-title">nouvelle actualité</h2>

      {message && (
        <p className={`admin-message ${message.type}`} role="status">
          {message.text}
        </p>
      )}

      <div className="admin-field">
        <label className="admin-label" htmlFor="email-subject">
          objet
        </label>
        <input
          id="email-subject"
          className="admin-input"
          value={subject}
          onChange={(e) => {
            setSubject(e.target.value);
            setConfirmCount(null);
          }}
        />
      </div>

      <div className="admin-field">
        <label className="admin-label" htmlFor="email-body">
          message
        </label>
        <textarea
          id="email-body"
          className="admin-textarea"
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            setConfirmCount(null);
          }}
        />
        <p className="admin-help">Texte simple : une ligne vide sépare deux paragraphes. Vouvoiement, ton naocast.</p>
      </div>

      <div className="admin-field" style={{ maxWidth: 420 }}>
        <label className="admin-label" htmlFor="email-segment">
          destinataires
        </label>
        <select
          id="email-segment"
          className="admin-select"
          value={segment}
          onChange={(e) => {
            setSegment(e.target.value as Segment);
            setConfirmCount(null);
          }}
        >
          {SEGMENTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <p className="admin-help">Les personnes désinscrites des actualités sont toujours exclues.</p>
      </div>

      {confirmCount === null ? (
        <div className="admin-row">
          <button type="button" className="admin-btn secondary" disabled={!ready || busy !== null} onClick={sendTest}>
            {busy === "test" ? "Envoi..." : `M'envoyer un test (${adminEmail})`}
          </button>
          <button type="button" className="admin-btn primary" disabled={!ready || busy !== null} onClick={prepareBroadcast}>
            {busy === "prepare" ? "Calcul..." : "Préparer l'envoi"}
          </button>
        </div>
      ) : (
        <div className="admin-card highlight" style={{ padding: 16 }}>
          <p style={{ margin: "0 0 12px" }}>
            {confirmCount === 0
              ? "Aucun destinataire pour ce segment."
              : `Ce mail va partir à ${confirmCount} personne${confirmCount > 1 ? "s" : ""}. Tu as relu le test ?`}
          </p>
          <div className="admin-row">
            <button type="button" className="admin-btn ghost" disabled={busy !== null} onClick={() => setConfirmCount(null)}>
              Annuler
            </button>
            {confirmCount > 0 && (
              <button type="button" className="admin-btn blue" disabled={busy !== null} onClick={confirmBroadcast}>
                {busy === "send" ? "Envoi..." : `Envoyer à ${confirmCount} personne${confirmCount > 1 ? "s" : ""}`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
