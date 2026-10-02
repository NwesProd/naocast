"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ModuleRow {
  key: string;
  label: string;
  // Déjà inclus dans le forfait de l'utilisateur : rien à activer.
  includedInPlan: boolean;
}

export function ModulesCard({ userId, modules, initialExtra }: { userId: string; modules: ModuleRow[]; initialExtra: string[] }) {
  const router = useRouter();
  const [extra, setExtra] = useState<string[]>(initialExtra);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const dirty = extra.length !== initialExtra.length || extra.some((k) => !initialExtra.includes(k));

  function toggle(key: string) {
    setExtra((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
    setMessage(null);
  }

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/modules`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modules: extra }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "L'enregistrement a échoué.");
      setMessage({ type: "success", text: "Modules enregistrés. Ils sont actifs au prochain chargement de l'app par l'utilisateur." });
      router.refresh();
    } catch (err) {
      setMessage({ type: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-card">
      <h2 className="admin-section-title">modules</h2>
      <p className="admin-help" style={{ marginTop: -4, marginBottom: 12 }}>
        Active à la main un module en dehors du forfait, par exemple pour un testeur.
      </p>

      {message && (
        <p className={`admin-message ${message.type}`} role="status">
          {message.text}
        </p>
      )}

      <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
        {modules.map((m) => (
          <label key={m.key} className="admin-row" style={{ gap: 10 }}>
            <input
              type="checkbox"
              checked={m.includedInPlan || extra.includes(m.key)}
              disabled={m.includedInPlan || busy}
              onChange={() => toggle(m.key)}
            />
            <span>{m.label}</span>
            {m.includedInPlan && <span className="admin-help" style={{ margin: 0 }}>inclus dans le forfait</span>}
            {!m.includedInPlan && extra.includes(m.key) && <span className="admin-help" style={{ margin: 0 }}>activé à la main</span>}
          </label>
        ))}
      </div>

      <button type="button" className="admin-btn blue" disabled={!dirty || busy} onClick={save}>
        {busy ? "Enregistrement..." : "Enregistrer les modules"}
      </button>
    </div>
  );
}
