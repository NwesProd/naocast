import { requireAdminPage } from "@/lib/admin";
import { EmailsClient } from "./EmailsClient";

export default async function AdminEmailsPage() {
  const admin = await requireAdminPage();
  const hasResendKey = !!process.env.RESEND_API_KEY;

  return (
    <>
      <div className="admin-page-head">
        <div>
          <h1 className="admin-title">emails</h1>
          <p className="admin-subtitle">Envoie une actualité à tes utilisateurs, après un test sur ta propre adresse.</p>
        </div>
      </div>

      {!hasResendKey && (
        <p className="admin-message error" role="status">
          RESEND_API_KEY n&apos;est pas configurée : les envois sont simulés (visibles dans les logs du serveur) et aucun mail ne part.
        </p>
      )}

      <EmailsClient adminEmail={admin.email} />

      <section className="admin-section" style={{ marginTop: 32 }}>
        <h2 className="admin-section-title">mails automatiques</h2>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Mail</th>
                <th>Déclencheur</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Bienvenue</td>
                <td>À l&apos;inscription (renvoyable depuis la fiche utilisateur)</td>
              </tr>
              <tr>
                <td>Mot de passe oublié</td>
                <td>Demande de l&apos;utilisateur, ou envoi depuis la fiche utilisateur</td>
              </tr>
              <tr>
                <td>Magic link</td>
                <td>Envoi depuis la fiche utilisateur (valable 30 minutes, à usage unique)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
