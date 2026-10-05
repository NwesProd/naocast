import Link from "next/link";
import { requireAdminPage } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { isTestEmail } from "@/lib/adminStats";
import { Pill, formatDateTime } from "../ui";
import { HandledToggle } from "./HandledToggle";

const KIND: Record<string, { label: string; tone: "danger" | "blue" | "neutral" }> = {
  BUG: { label: "Bug", tone: "danger" },
  IDEA: { label: "Idée", tone: "blue" },
  OTHER: { label: "Autre", tone: "neutral" },
};

// Retours envoyés par les utilisateurs via le module "Feedback" de l'app (bug, idée,
// autre), les plus récents d'abord. À traiter en premier, puis traités.
export default async function AdminSupportPage({ searchParams }: { searchParams: Promise<{ done?: string; test?: string }> }) {
  await requireAdminPage();
  const { done, test } = await searchParams;
  const showDone = done === "1";
  const showTest = test === "1";

  const all = await prisma.feedback.findMany({
    where: showDone ? {} : { handled: false },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const items = showTest ? all : all.filter((f) => !isTestEmail(f.userEmail));
  const pending = items.filter((f) => !f.handled).length;

  return (
    <>
      <div className="admin-page-head">
        <div>
          <h1 className="admin-title">support</h1>
          <p className="admin-subtitle">
            {pending} retour{pending > 1 ? "s" : ""} à traiter. Ils arrivent aussi par email.
          </p>
        </div>
      </div>

      <form method="GET" className="admin-row" style={{ marginBottom: 16 }}>
        <label className="admin-row" style={{ gap: 6, color: "var(--ink-muted)" }}>
          <input type="checkbox" name="done" value="1" defaultChecked={showDone} />
          Afficher les retours traités
        </label>
        <label className="admin-row" style={{ gap: 6, color: "var(--ink-muted)" }}>
          <input type="checkbox" name="test" value="1" defaultChecked={showTest} />
          Afficher les comptes de test
        </label>
        <button type="submit" className="admin-btn secondary">
          Filtrer
        </button>
      </form>

      {items.length === 0 ? (
        <div className="admin-card admin-empty">
          <h2 className="admin-section-title" style={{ marginBottom: 8 }}>
            rien à traiter
          </h2>
          <p style={{ margin: 0 }}>Les retours envoyés depuis le bouton « Feedback » de l&apos;app apparaîtront ici.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {items.map((f) => (
            <div key={f.id} className="admin-card" style={f.handled ? { opacity: 0.6 } : undefined}>
              <div className="admin-row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
                <div className="admin-row">
                  <Pill tone={KIND[f.kind].tone}>{KIND[f.kind].label}</Pill>
                  <Link href={`/admin/users/${f.userId}`} className="admin-link">
                    {f.userEmail}
                  </Link>
                  <span className="admin-help">{formatDateTime(f.createdAt)}</span>
                </div>
                <HandledToggle id={f.id} handled={f.handled} />
              </div>
              <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{f.message}</p>
              {f.pageUrl && (
                <p className="admin-help" style={{ marginTop: 8 }}>
                  Page : {f.pageUrl}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
