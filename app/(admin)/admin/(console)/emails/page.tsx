import Link from "next/link";
import { requireAdminPage } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { listTemplates } from "@/lib/emailTemplateStore";
import { EmailLogTable } from "../EmailLogTable";
import { EmailsClient } from "./EmailsClient";
import { TemplatesClient } from "./TemplatesClient";

const LOG_PAGE_SIZE = 25;

export default async function AdminEmailsPage({ searchParams }: { searchParams: Promise<{ page?: string; echecs?: string }> }) {
  const admin = await requireAdminPage();
  const { page, echecs } = await searchParams;
  const failedOnly = echecs === "1";
  const currentPage = Math.max(1, Number(page) || 1);
  const logWhere = failedOnly ? { status: "FAILED" as const } : {};
  const logTotal = await prisma.emailLog.count({ where: logWhere });
  const logRows = await prisma.emailLog.findMany({
    where: logWhere,
    orderBy: { createdAt: "desc" },
    skip: (currentPage - 1) * LOG_PAGE_SIZE,
    take: LOG_PAGE_SIZE,
  });
  const logPages = Math.max(1, Math.ceil(logTotal / LOG_PAGE_SIZE));
  function logHref(p: number, failed = failedOnly) {
    const params = new URLSearchParams();
    if (failed) params.set("echecs", "1");
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return `/admin/emails${qs ? `?${qs}` : ""}#journal`;
  }
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

      <section id="journal" className="admin-section" style={{ marginTop: 32 }}>
        <div className="admin-page-head" style={{ marginBottom: 12 }}>
          <div>
            <h2 className="admin-section-title" style={{ marginBottom: 2 }}>
              journal d&apos;emails
            </h2>
            <p className="admin-card-detail" style={{ marginTop: 0 }}>
              {logTotal} email{logTotal > 1 ? "s" : ""}{failedOnly ? " en échec" : ""}. « Envoyé » veut dire accepté par Resend, pas forcément lu.
            </p>
          </div>
          <Link href={logHref(1, !failedOnly)} className="admin-btn secondary small">
            {failedOnly ? "Voir tous les emails" : "Voir les échecs"}
          </Link>
        </div>
        <EmailLogTable rows={logRows} showRecipient />
        {logPages > 1 && (
          <div className="admin-row" style={{ marginTop: 16, justifyContent: "space-between" }}>
            <span className="admin-help">
              Page {currentPage} sur {logPages}
            </span>
            <div className="admin-row">
              {currentPage > 1 && (
                <Link href={logHref(currentPage - 1)} className="admin-btn secondary small">
                  Précédent
                </Link>
              )}
              {currentPage < logPages && (
                <Link href={logHref(currentPage + 1)} className="admin-btn secondary small">
                  Suivant
                </Link>
              )}
            </div>
          </div>
        )}
      </section>
    </>
  );
}
