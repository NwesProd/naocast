import Link from "next/link";
import { requireAdminPage } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { isTestEmail, realUserWhere } from "@/lib/adminStats";
import { PLAN_LABELS } from "@/lib/plan";
import { Pill, PlanPill, formatDate } from "../ui";
import type { Plan, Prisma } from "@/app/generated/prisma/client";

const PAGE_SIZE = 25;
const PLANS: Plan[] = ["FREE", "BASIC", "INFINITY", "LIFETIME"];

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; plan?: string; page?: string; test?: string }>;
}) {
  await requireAdminPage();
  const { q, plan, page, test } = await searchParams;
  // Les comptes de test (emails example.*) sont masqués par défaut.
  const showTest = test === "1";

  const currentPage = Math.max(1, Number(page) || 1);
  const planFilter = PLANS.includes(plan as Plan) ? (plan as Plan) : undefined;
  const where: Prisma.UserWhereInput = {
    ...(q ? { email: { contains: q.trim(), mode: "insensitive" } } : {}),
    ...(planFilter ? { plan: planFilter } : {}),
    ...(showTest ? {} : realUserWhere),
  };

  const total = await prisma.user.count({ where });
  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      email: true,
      plan: true,
      profileType: true,
      createdAt: true,
      subscriptionStatus: true,
      marketingOptOut: true,
      podcast: { select: { title: true, _count: { select: { episodes: true } } } },
    },
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  function pageHref(p: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (planFilter) params.set("plan", planFilter);
    if (showTest) params.set("test", "1");
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return `/admin/users${qs ? `?${qs}` : ""}`;
  }

  return (
    <>
      <div className="admin-page-head">
        <div>
          <h1 className="admin-title">utilisateurs</h1>
          <p className="admin-subtitle">
            {total} compte{total > 1 ? "s" : ""}
            {q || planFilter ? " correspondant à ta recherche" : ""}.
          </p>
        </div>
      </div>

      <form method="GET" className="admin-row" style={{ marginBottom: 16 }}>
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Rechercher un email"
          aria-label="Rechercher un email"
          className="admin-input"
          style={{ maxWidth: 320 }}
        />
        <select name="plan" defaultValue={planFilter ?? ""} aria-label="Filtrer par forfait" className="admin-select" style={{ maxWidth: 220 }}>
          <option value="">Tous les forfaits</option>
          {PLANS.map((p) => (
            <option key={p} value={p}>
              {PLAN_LABELS[p]}
            </option>
          ))}
        </select>
        <label className="admin-row" style={{ gap: 6, color: "var(--ink-muted)" }}>
          <input type="checkbox" name="test" value="1" defaultChecked={showTest} />
          Afficher les comptes de test
        </label>
        <button type="submit" className="admin-btn secondary">
          Filtrer
        </button>
      </form>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Forfait</th>
              <th>Profil</th>
              <th>Podcast</th>
              <th className="num">Épisodes</th>
              <th>Inscrit le</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td colSpan={6} className="admin-empty">
                  Aucun utilisateur trouvé.
                </td>
              </tr>
            )}
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <Link href={`/admin/users/${u.id}`} className="admin-link">
                    {u.email}
                  </Link>
                  {isTestEmail(u.email) && (
                    <span style={{ marginLeft: 8 }}>
                      <Pill>test</Pill>
                    </span>
                  )}
                </td>
                <td>
                  <PlanPill plan={u.plan} />
                </td>
                <td>{u.profileType.toLowerCase()}</td>
                <td>{u.podcast?.title ?? "Pas encore configuré"}</td>
                <td className="num">{u.podcast?._count.episodes ?? 0}</td>
                <td>{formatDate(u.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="admin-row" style={{ marginTop: 16, justifyContent: "space-between" }}>
          <span className="admin-help">
            Page {currentPage} sur {totalPages}
          </span>
          <div className="admin-row">
            {currentPage > 1 && (
              <Link href={pageHref(currentPage - 1)} className="admin-btn secondary small">
                Précédent
              </Link>
            )}
            {currentPage < totalPages && (
              <Link href={pageHref(currentPage + 1)} className="admin-btn secondary small">
                Suivant
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}
