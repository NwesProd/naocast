import { Pill, formatDateTime } from "./ui";
import type { EmailStatus } from "@/app/generated/prisma/client";

export interface EmailLogRow {
  id: string;
  toEmail: string;
  kind: string;
  subject: string;
  status: EmailStatus;
  error: string | null;
  createdAt: Date;
}

const KIND_LABELS: Record<string, string> = {
  welcome: "Bienvenue",
  password_reset: "Mot de passe oublié",
  magic_link: "Magic link",
  news: "Actualité",
  test: "Test",
  other: "Autre",
};

const STATUS: Record<EmailStatus, { label: string; tone: "success" | "danger" | "neutral" }> = {
  SENT: { label: "Envoyé", tone: "success" },
  FAILED: { label: "Échec", tone: "danger" },
  SIMULATED: { label: "Simulé", tone: "neutral" },
};

// Tableau du journal d'emails, partagé par l'onglet Emails (global, avec la
// colonne destinataire) et la fiche utilisateur. "Envoyé" = accepté par
// Resend, pas forcément lu ni même délivré.
export function EmailLogTable({ rows, showRecipient }: { rows: EmailLogRow[]; showRecipient: boolean }) {
  const colSpan = showRecipient ? 5 : 4;
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Date</th>
            {showRecipient && <th>Destinataire</th>}
            <th>Type</th>
            <th>Objet</th>
            <th>Statut</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={colSpan} className="admin-empty">
                Aucun email envoyé pour le moment.
              </td>
            </tr>
          )}
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{formatDateTime(row.createdAt)}</td>
              {showRecipient && <td>{row.toEmail}</td>}
              <td>{KIND_LABELS[row.kind] ?? row.kind}</td>
              <td style={{ maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis" }} title={row.subject}>
                {row.subject}
              </td>
              <td title={row.error ?? undefined}>
                <Pill tone={STATUS[row.status].tone}>{STATUS[row.status].label}</Pill>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
