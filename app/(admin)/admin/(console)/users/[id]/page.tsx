import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { PLAN_MODULES, BUILT_MODULES } from "@/lib/plan";
import { getStorageReport, type UserStorage } from "@/lib/storageStats";
import { PlanPill, StatusPill, formatBytes, formatDate, formatDateTime } from "../../ui";
import { EmailLogTable } from "../../EmailLogTable";
import { ModulesCard } from "./ModulesCard";
import { UserActions } from "./UserActions";

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) notFound();

  const podcast = await prisma.podcast.findUnique({ where: { userId: id }, select: { id: true, title: true } });
  const episodes = podcast
    ? await prisma.episode.findMany({
        where: { podcastId: podcast.id },
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true, season: true, episodeNumber: true, status: true, createdAt: true },
      })
    : [];

  const emailLog = await prisma.emailLog.findMany({
    where: { toEmail: user.email.toLowerCase() },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  let storage: UserStorage | null = null;
  try {
    storage = (await getStorageReport()).byUser.get(id) ?? { bytes: 0, files: 0, rushes: 0, episodes: 0, podcast: 0 };
  } catch {
    storage = null;
  }

  const hasActiveSubscription = !!user.stripeSubscriptionId && ["active", "trialing", "past_due"].includes(user.subscriptionStatus ?? "");

  return (
    <>
      <div className="admin-page-head">
        <div>
          <p className="admin-subtitle" style={{ margin: "0 0 8px" }}>
            <Link href="/admin/users" className="admin-link">
              Utilisateurs
            </Link>
          </p>
          <h1 className="admin-title" style={{ textTransform: "none" }}>
            {user.email}
          </h1>
          <p className="admin-subtitle">Inscrit le {formatDate(user.createdAt)}</p>
        </div>
        <PlanPill plan={user.plan} />
      </div>

      <section className="admin-section">
        <div className="admin-grid cols-2">
          <div className="admin-card">
            <h2 className="admin-section-title">compte</h2>
            <dl className="admin-kv">
              <dt>Profil</dt>
              <dd>{user.profileType.toLowerCase()}</dd>
              <dt>Podcast</dt>
              <dd>{podcast?.title ?? "Pas encore configuré"}</dd>
              <dt>Mails d&apos;actualités</dt>
              <dd>{user.marketingOptOut ? "Désinscrit" : "Inscrit"}</dd>
            </dl>
          </div>
          <div className="admin-card">
            <h2 className="admin-section-title">abonnement</h2>
            <dl className="admin-kv">
              <dt>Forfait</dt>
              <dd>
                <PlanPill plan={user.plan} />
              </dd>
              <dt>Statut Stripe</dt>
              <dd>{user.subscriptionStatus ?? "Aucun abonnement"}</dd>
              <dt>Fin de période</dt>
              <dd>{user.currentPeriodEnd ? formatDate(user.currentPeriodEnd) : "Sans objet"}</dd>
              <dt>Client Stripe</dt>
              <dd>
                {user.stripeCustomerId ? (
                  <a
                    href={`https://dashboard.stripe.com/customers/${user.stripeCustomerId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="admin-link"
                  >
                    {user.stripeCustomerId}
                  </a>
                ) : (
                  "Pas de client Stripe"
                )}
              </dd>
            </dl>
          </div>
        </div>
      </section>

      <section className="admin-section">
        <div className="admin-grid cols-2">
          <ModulesCard
            userId={user.id}
            initialExtra={user.extraModules}
            modules={BUILT_MODULES.map((m) => ({ key: m.key, label: m.label, includedInPlan: PLAN_MODULES[user.plan].includes(m.key) }))}
          />
          <div className="admin-card">
            <h2 className="admin-section-title">stockage</h2>
            {storage ? (
              <>
                <div className="admin-figure">{formatBytes(storage.bytes)}</div>
                <div className="admin-card-detail">
                  {storage.files} fichier{storage.files > 1 ? "s" : ""}
                </div>
                <dl className="admin-kv" style={{ marginTop: 16 }}>
                  <dt>Rushs</dt>
                  <dd>{formatBytes(storage.rushes)}</dd>
                  <dt>Épisodes</dt>
                  <dd>{formatBytes(storage.episodes)}</dd>
                  <dt>Fichiers du podcast</dt>
                  <dd>{formatBytes(storage.podcast)}</dd>
                </dl>
              </>
            ) : (
              <p className="admin-message error">Stockage indisponible pour le moment.</p>
            )}
          </div>
        </div>
      </section>

      <section className="admin-section">
        <UserActions userId={user.id} email={user.email} currentPlan={user.plan} hasActiveSubscription={hasActiveSubscription} />
      </section>

      <section className="admin-section">
        <h2 className="admin-section-title">épisodes ({episodes.length})</h2>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Titre</th>
                <th>Statut</th>
                <th>Créé le</th>
              </tr>
            </thead>
            <tbody>
              {episodes.length === 0 && (
                <tr>
                  <td colSpan={3} className="admin-empty">
                    Aucun épisode pour le moment.
                  </td>
                </tr>
              )}
              {episodes.map((ep) => (
                <tr key={ep.id}>
                  <td>
                    {[ep.season != null ? `S${ep.season}` : null, ep.episodeNumber != null ? `E${ep.episodeNumber}` : null]
                      .filter(Boolean)
                      .join("")}{" "}
                    {ep.title || "Sans titre"}
                  </td>
                  <td>
                    <StatusPill status={ep.status} />
                  </td>
                  <td>{formatDateTime(ep.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-section">
        <h2 className="admin-section-title">journal d&apos;emails</h2>
        <EmailLogTable rows={emailLog} showRecipient={false} />
        {emailLog.length === 20 && <p className="admin-help">Les 20 derniers emails. L&apos;historique complet est dans l&apos;onglet Emails.</p>}
      </section>
    </>
  );
}
