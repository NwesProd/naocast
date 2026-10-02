import { requireAdminPage } from "@/lib/admin";
import { listTemplates } from "@/lib/emailTemplateStore";
import { EmailsClient } from "./EmailsClient";
import { TemplatesClient } from "./TemplatesClient";

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

      <TemplatesClient templates={await listTemplates()} adminEmail={admin.email} />
    </>
  );
}
