"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TEMPLATE_DEFS, TEMPLATE_KEYS, renderTemplate, type TemplateFields, type TemplateKey } from "@/lib/emailTemplates";
import { Pill } from "../ui";

type TemplateState = Record<TemplateKey, { fields: TemplateFields; customized: boolean }>;

// Lien factice pour l'aperçu (jamais envoyé tel quel : chaque envoi réel
// génère son propre lien).
const PREVIEW_URL = "https://app.naocast.com/exemple";

export function TemplatesClient({ templates, adminEmail }: { templates: TemplateState; adminEmail: string }) {
  const router = useRouter();
  const [openKey, setOpenKey] = useState<TemplateKey | null>(null);

  return (
    <section className="admin-section" style={{ marginTop: 32 }}>
      <h2 className="admin-section-title">mails automatiques</h2>
      <p className="admin-help" style={{ marginTop: -4, marginBottom: 12 }}>
        Clique sur un mail pour voir son modèle et le modifier.
      </p>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Mail</th>
              <th>Déclencheur</th>
              <th>État</th>
            </tr>
          </thead>
          <tbody>
            {TEMPLATE_KEYS.map((key) => (
              <tr key={key} onClick={() => setOpenKey(key)} style={{ cursor: "pointer" }}>
                <td>
                  <button
                    type="button"
                    className="admin-link"
                    style={{ border: 0, background: "none", font: "inherit", cursor: "pointer", padding: 0 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenKey(key);
                    }}
                  >
                    {TEMPLATE_DEFS[key].label}
                  </button>
                </td>
                <td>{TEMPLATE_DEFS[key].trigger}</td>
                <td>{templates[key].customized ? <Pill tone="blue">Modifié</Pill> : <Pill>Modèle d&apos;origine</Pill>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {openKey && (
        <TemplateDialog
          key={openKey}
          templateKey={openKey}
          initial={templates[openKey]}
          adminEmail={adminEmail}
          onClose={() => setOpenKey(null)}
          onChanged={() => router.refresh()}
        />
      )}
    </section>
  );
}

function TemplateDialog({
  templateKey,
  initial,
  adminEmail,
  onClose,
  onChanged,
}: {
  templateKey: TemplateKey;
  initial: { fields: TemplateFields; customized: boolean };
  adminEmail: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const def = TEMPLATE_DEFS[templateKey];
  const [fields, setFields] = useState<TemplateFields>(initial.fields);
  const [customized, setCustomized] = useState(initial.customized);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const dirty = (Object.keys(fields) as (keyof TemplateFields)[]).some((k) => fields[k] !== initial.fields[k]);
  const ready = fields.subject.trim() && fields.heading.trim() && fields.body.trim() && fields.buttonLabel.trim();

  useEffect(() => {
    firstFieldRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function set<K extends keyof TemplateFields>(key: K, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
    setMessage(null);
  }

  async function request(action: string, url: string, method: "PUT" | "DELETE" | "POST", withBody: boolean) {
    setBusy(action);
    setMessage(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: withBody ? JSON.stringify(fields) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "L'action a échoué.");
      return data as { sentTo?: string };
    } catch (err) {
      setMessage({ type: "error", text: (err as Error).message });
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    const data = await request("save", `/api/admin/emails/templates/${templateKey}`, "PUT", true);
    if (data) {
      setCustomized(true);
      setMessage({ type: "success", text: "Modèle enregistré. Il sera utilisé pour les prochains envois." });
      onChanged();
    }
  }

  async function reset() {
    const data = await request("reset", `/api/admin/emails/templates/${templateKey}`, "DELETE", false);
    if (data) {
      setFields(def.defaults);
      setCustomized(false);
      setMessage({ type: "success", text: "Modèle d'origine rétabli." });
      onChanged();
    }
  }

  async function sendTest() {
    const data = await request("test", `/api/admin/emails/templates/${templateKey}/test`, "POST", true);
    if (data) setMessage({ type: "success", text: `Mail de test envoyé à ${data.sentTo ?? adminEmail}.` });
  }

  const preview = renderTemplate(
    {
      ...fields,
      // Aperçu tolérant : un champ vidé ne fait pas disparaître le bloc.
      heading: fields.heading || " ",
      buttonLabel: fields.buttonLabel || " ",
    },
    PREVIEW_URL
  );

  return (
    <div className="admin-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="template-dialog-title">
        <div className="admin-modal-head">
          <div>
            <h2 id="template-dialog-title" className="admin-section-title" style={{ marginBottom: 2 }}>
              {def.label}
            </h2>
            <p className="admin-card-detail" style={{ marginTop: 0 }}>
              {def.trigger}
            </p>
          </div>
          <button type="button" className="admin-btn ghost small" onClick={onClose}>
            Fermer
          </button>
        </div>

        <div className="admin-modal-body">
          <div>
            {message && (
              <p className={`admin-message ${message.type}`} role="status">
                {message.text}
              </p>
            )}

            <div className="admin-field">
              <label className="admin-label" htmlFor="tpl-subject">
                objet
              </label>
              <input id="tpl-subject" ref={firstFieldRef} className="admin-input" value={fields.subject} maxLength={200} onChange={(e) => set("subject", e.target.value)} />
            </div>
            <div className="admin-field">
              <label className="admin-label" htmlFor="tpl-heading">
                titre dans le mail
              </label>
              <input id="tpl-heading" className="admin-input" value={fields.heading} maxLength={200} onChange={(e) => set("heading", e.target.value)} />
            </div>
            <div className="admin-field">
              <label className="admin-label" htmlFor="tpl-body">
                message
              </label>
              <textarea id="tpl-body" className="admin-textarea" value={fields.body} maxLength={5000} onChange={(e) => set("body", e.target.value)} />
              <p className="admin-help">Une ligne vide sépare deux paragraphes.</p>
            </div>
            <div className="admin-field">
              <label className="admin-label" htmlFor="tpl-button">
                libellé du bouton
              </label>
              <input id="tpl-button" className="admin-input" value={fields.buttonLabel} maxLength={60} onChange={(e) => set("buttonLabel", e.target.value)} />
              <p className="admin-help">{def.linkHelp}</p>
            </div>
            <div className="admin-field">
              <label className="admin-label" htmlFor="tpl-note">
                mention sous le bouton
              </label>
              <textarea id="tpl-note" className="admin-textarea" style={{ minHeight: 72 }} value={fields.note} maxLength={500} onChange={(e) => set("note", e.target.value)} />
            </div>
          </div>

          <div>
            <p className="admin-label">aperçu</p>
            <iframe title="Aperçu du mail" className="admin-modal-preview" sandbox="" srcDoc={preview.html} />
          </div>
        </div>

        <div className="admin-modal-foot">
          <button type="button" className="admin-btn ghost" disabled={busy !== null || (!customized && !dirty)} onClick={reset}>
            {busy === "reset" ? "..." : "Rétablir le modèle d'origine"}
          </button>
          <div className="admin-row">
            <button type="button" className="admin-btn secondary" disabled={busy !== null || !ready} onClick={sendTest}>
              {busy === "test" ? "Envoi..." : "M'envoyer un test"}
            </button>
            <button type="button" className="admin-btn blue" disabled={busy !== null || !ready || !dirty} onClick={save}>
              {busy === "save" ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
