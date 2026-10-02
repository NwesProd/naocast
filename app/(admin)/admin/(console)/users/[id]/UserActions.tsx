"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Plan = "FREE" | "BASIC" | "INFINITY" | "LIFETIME";

const PLAN_OPTIONS: { value: Plan; label: string }[] = [
  { value: "FREE", label: "naocast free" },
  { value: "BASIC", label: "naocast basic" },
  { value: "INFINITY", label: "naocast infinity" },
  { value: "LIFETIME", label: "naocast lifetime" },
];

export function UserActions({
  userId,
  email,
  currentPlan,
  hasActiveSubscription,
}: {
  userId: string;
  email: string;
  currentPlan: Plan;
  hasActiveSubscription: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [plan, setPlan] = useState<Plan>(currentPlan);

  async function run(key: string, url: string, method: "POST" | "PATCH", body: unknown, successText: (data: { sentTo?: string }) => string) {
    setBusy(key);
    setMessage(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "L'action a échoué.");
      setMessage({ type: "success", text: successText(data) });
      router.refresh();
    } catch (err) {
      setMessage({ type: "error", text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="admin-card">
      <h2 className="admin-section-title">actions</h2>

      {message && (
        <p className={`admin-message ${message.type}`} role="status">
          {message.text}
        </p>
      )}

      <div className="admin-row" style={{ marginBottom: 24 }}>
        <button
          type="button"
          className="admin-btn secondary"
          disabled={busy !== null}
          onClick={() =>
            run("reset", `/api/admin/users/${userId}/reset-password`, "POST", null, (d) => `Lien de réinitialisation envoyé à ${d.sentTo ?? email}.`)
          }
        >
          {busy === "reset" ? "Envoi..." : "Envoyer un lien de réinitialisation"}
        </button>
        <button
          type="button"
          className="admin-btn secondary"
          disabled={busy !== null}
          onClick={() => run("magic", `/api/admin/users/${userId}/magic-link`, "POST", null, (d) => `Magic link envoyé à ${d.sentTo ?? email}.`)}
        >
          {busy === "magic" ? "Envoi..." : "Envoyer un magic link"}
        </button>
        <button
          type="button"
          className="admin-btn ghost"
          disabled={busy !== null}
          onClick={() => run("welcome", `/api/admin/users/${userId}/welcome`, "POST", null, (d) => `Mail de bienvenue renvoyé à ${d.sentTo ?? email}.`)}
        >
          {busy === "welcome" ? "Envoi..." : "Renvoyer le mail de bienvenue"}
        </button>
      </div>

      <div className="admin-field" style={{ maxWidth: 360, marginBottom: 0 }}>
        <label className="admin-label" htmlFor="plan-select">
          forfait
        </label>
        <div className="admin-row">
          <select
            id="plan-select"
            className="admin-select"
            value={plan}
            onChange={(e) => setPlan(e.target.value as Plan)}
            disabled={busy !== null}
          >
            {PLAN_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="admin-btn blue"
            disabled={busy !== null || plan === currentPlan}
            onClick={() => run("plan", `/api/admin/users/${userId}/plan`, "PATCH", { plan }, () => "Forfait mis à jour.")}
          >
            {busy === "plan" ? "..." : "Appliquer"}
          </button>
        </div>
        <p className="admin-help">
          {hasActiveSubscription
            ? "Cet utilisateur a un abonnement Stripe actif : Stripe reste la référence et réécrira le forfait au prochain évènement d'abonnement."
            : "Attribution manuelle, sans paiement (testeur, geste commercial)."}
        </p>
      </div>
    </div>
  );
}
