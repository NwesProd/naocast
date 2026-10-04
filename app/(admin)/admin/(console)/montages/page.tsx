import Link from "next/link";
import { requireAdminPage } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { isTestEmail } from "@/lib/adminStats";
import { Pill, StatusPill, formatDateTime } from "../ui";

// Demandes de montage envoyées par les podcasteurs ("J'ai besoin d'un monteur"),
// payées via Stripe. Les demandes dont le paiement n'a pas abouti sont masquées
// par défaut.
export default async function AdminMontagesPage({ searchParams }: { searchParams: Promise<{ unpaid?: string; test?: string }> }) {
  await requireAdminPage();
  const { unpaid, test } = await searchParams;
  const showUnpaid = unpaid === "1";
  const showTest = test === "1";

  const all = await prisma.editingRequest.findMany({
    where: showUnpaid ? {} : { status: "PAID" },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const requests = showTest ? all : all.filter((r) => !isTestEmail(r.userEmail));

  const episodeIds = requests.map((r) => r.episodeId).filter((id): id is string => !!id);
  const episodes = episodeIds.length
    ? await prisma.episode.findMany({ where: { id: { in: episodeIds } }, select: { id: true, status: true } })
    : [];
  const statusById = new Map(episodes.map((e) => [e.id, e.status]));

  const paidCount = requests.filter((r) => r.status === "PAID").length;

  return (
    <>
      <div className="admin-page-head">
        <div>
          <h1 className="admin-title">montages</h1>
          <p className="admin-subtitle">
            {paidCount} demande{paidCount > 1 ? "s" : ""} de montage payée{paidCount > 1 ? "s" : ""}. Chaque demande est aussi envoyée par email à l&apos;équipe.
          </p>
        </div>
      </div>

      <form method="GET" className="admin-row" style={{ marginBottom: 16 }}>
        <label className="admin-row" style={{ gap: 6, color: "var(--ink-muted)" }}>
          <input type="checkbox" name="unpaid" value="1" defaultChecked={showUnpaid} />
          Afficher les paiements non finalisés
        </label>
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
              <th>Reçue le</th>
              <th>Podcast</th>
              <th>Épisode</th>
              <th>Podcasteur</th>
              <th>Paiement</th>
              <th>Épisode</th>
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 && (
              <tr>
                <td colSpan={6} className="admin-empty">
                  Aucune demande de montage pour le moment.
                </td>
              </tr>
            )}
            {requests.map((r) => {
              const epStatus = r.episodeId ? statusById.get(r.episodeId) : undefined;
              return (
                <tr key={r.id}>
                  <td>
                    <Link href={`/admin/montages/${r.id}`} className="admin-link">
                      {formatDateTime(r.paidAt ?? r.createdAt)}
                    </Link>
                  </td>
                  <td>{r.podcastTitle ?? "?"}</td>
                  <td>{r.episodeTitle ?? "Sans titre"}</td>
                  <td>{r.userEmail}</td>
                  <td>{r.status === "PAID" ? <Pill tone="success">Payé</Pill> : <Pill tone="orange">En attente</Pill>}</td>
                  <td>{epStatus ? <StatusPill status={epStatus} /> : <Pill>Supprimé</Pill>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
