import Link from "next/link";
import { requireAdminPage } from "@/lib/admin";
import { getDashboardStats } from "@/lib/adminStats";
import { getStorageSummary, type StorageSummary } from "@/lib/storageStats";
import { PLAN_LABELS } from "@/lib/plan";
import { DailyBars, PlanPill, formatBytes, formatDate, formatEuro, statusLabel } from "./ui";
import type { Plan } from "@/app/generated/prisma/client";

const PLAN_ORDER: Plan[] = ["FREE", "BASIC", "INFINITY", "LIFETIME"];
const STATUS_ORDER = ["DRAFT", "QUEUED", "PROCESSING", "READY_FOR_REVIEW", "EXPORTED", "HUMAN_EDITOR_REQUESTED", "FAILED"];

export default async function AdminDashboardPage() {
  await requireAdminPage();
  const stats = await getDashboardStats();

  // Le stockage interroge le bucket : un échec (droits, réseau) ne doit pas
  // empêcher d'afficher le reste du dashboard.
  let storage: StorageSummary | null = null;
  let storageError: string | null = null;
  try {
    storage = await getStorageSummary();
  } catch (err) {
    storageError = (err as Error).message;
  }

  return (
    <>
      <div className="admin-page-head">
        <div>
          <h1 className="admin-title">dashboard</h1>
          <p className="admin-subtitle">Voici où en est naocast. aujourd&apos;hui.</p>
        </div>
      </div>

      <section className="admin-section">
        <div className="admin-grid">
          <div className="admin-card">
            <div className="admin-card-label">Utilisateurs</div>
            <div className="admin-figure">{stats.totalUsers}</div>
            <div className="admin-card-detail">
              +{stats.newUsers7d} sur 7 jours, +{stats.newUsers30d} sur 30 jours
            </div>
          </div>
          <div className="admin-card">
            <div className="admin-card-label">Épisodes créés</div>
            <div className="admin-figure">{stats.totalEpisodes}</div>
            <div className="admin-card-detail">
              {stats.episodes30d} sur 30 jours, {stats.podcastCount} podcast{stats.podcastCount > 1 ? "s" : ""}
            </div>
          </div>
          <div className="admin-card">
            <div className="admin-card-label">Revenu récurrent estimé (TTC)</div>
            <div className="admin-figure">{formatEuro(stats.mrrEur)}</div>
            <div className="admin-card-detail">
              {stats.payingSubscribers} abonné{stats.payingSubscribers > 1 ? "s" : ""} payant{stats.payingSubscribers > 1 ? "s" : ""} par mois, {stats.lifetimeCount} lifetime ({formatEuro(stats.lifetimeRevenueEur)} encaissés)
            </div>
          </div>
        </div>
      </section>

      <section className="admin-section">
        <div className="admin-grid cols-2">
          <div className="admin-card">
            <h2 className="admin-section-title">stockage</h2>
            {storage ? (
              <>
                <div className="admin-figure">{formatBytes(storage.realBytes)}</div>
                <div className="admin-card-detail">
                  {storage.realFiles} fichier{storage.realFiles > 1 ? "s" : ""} des utilisateurs, dont {formatBytes(storage.byCategory.rushes)} de rushs,{" "}
                  {formatBytes(storage.byCategory.episodes)} d&apos;épisodes et {formatBytes(storage.byCategory.podcast)} de fichiers de podcast.
                </div>
                <div className="admin-card-detail">
                  Dans le bucket au total : {formatBytes(storage.totalBytes)}
                  {storage.testBytes > 0 && `, dont ${formatBytes(storage.testBytes)} de comptes de test`}
                  {storage.orphanFiles > 0 &&
                    `, et ${formatBytes(storage.orphanBytes)} non rattachés à un compte (${storage.orphanFiles} fichier${storage.orphanFiles > 1 ? "s" : ""})`}
                  .
                </div>
              </>
            ) : (
              <p className="admin-message error">Stockage indisponible : {storageError}</p>
            )}
          </div>
          <div className="admin-card">
            <h2 className="admin-section-title">plus gros consommateurs</h2>
            {storage && storage.top.length > 0 ? (
              <table className="admin-table" style={{ width: "100%" }}>
                <tbody>
                  {storage.top.map((u) => (
                    <tr key={u.id}>
                      <td style={{ paddingLeft: 0 }}>
                        <Link href={`/admin/users/${u.id}`} className="admin-link">
                          {u.email}
                        </Link>
                      </td>
                      <td className="num" style={{ paddingRight: 0 }}>{formatBytes(u.bytes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="admin-card-detail">Aucun fichier stocké pour le moment.</p>
            )}
          </div>
        </div>
      </section>

      <section className="admin-section">
        <div className="admin-grid cols-2">
          <div className="admin-card">
            <h2 className="admin-section-title">utilisateurs par forfait</h2>
            <table className="admin-table" style={{ width: "100%" }}>
              <tbody>
                {PLAN_ORDER.map((plan) => (
                  <tr key={plan}>
                    <td style={{ paddingLeft: 0 }}>{PLAN_LABELS[plan]}</td>
                    <td className="num" style={{ paddingRight: 0 }}>{stats.usersByPlan[plan]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="admin-card">
            <h2 className="admin-section-title">épisodes par statut</h2>
            <table className="admin-table" style={{ width: "100%" }}>
              <tbody>
                {STATUS_ORDER.map((status) => (
                  <tr key={status}>
                    <td style={{ paddingLeft: 0 }}>{statusLabel(status)}</td>
                    <td className="num" style={{ paddingRight: 0 }}>{stats.episodesByStatus[status] ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="admin-section">
        <div className="admin-grid cols-2">
          <div className="admin-card">
            <h2 className="admin-section-title">inscriptions, 30 jours</h2>
            <DailyBars points={stats.signupsDaily} label="Inscriptions" />
          </div>
          <div className="admin-card">
            <h2 className="admin-section-title">épisodes créés, 30 jours</h2>
            <DailyBars points={stats.episodesDaily} label="Épisodes créés" />
          </div>
        </div>
      </section>

      <section className="admin-section">
        <h2 className="admin-section-title">dernières inscriptions</h2>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Forfait</th>
                <th>Inscrit le</th>
              </tr>
            </thead>
            <tbody>
              {stats.latestUsers.map((u) => (
                <tr key={u.id}>
                  <td>
                    <Link href={`/admin/users/${u.id}`} className="admin-link">
                      {u.email}
                    </Link>
                  </td>
                  <td>
                    <PlanPill plan={u.plan} />
                  </td>
                  <td>{formatDate(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
