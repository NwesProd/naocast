import Link from "next/link";
import { requireAdminPage } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { Pill, formatDateTime } from "../ui";

const JOB_LABELS: Record<string, string> = {
  FETCH_RUSHES: "Récupération des rushs",
  TRANSCRIBE: "Transcription",
  SYNC_MULTICAM: "Synchro multicam",
  AUTOCUT: "Autocut",
  APPLY_MANUAL_CUTS: "Découpes",
  RENDER: "Rendu vidéo",
  EXPORT_AUDIO: "Export audio",
  MANUAL_TRANSCRIBE: "Transcript (avec locuteurs)",
};

const DAY_MS = 24 * 60 * 60 * 1000;

function sevenDaysAgo(): Date {
  return new Date(Date.now() - 7 * DAY_MS);
}

export default async function AdminHealthPage() {
  await requireAdminPage();

  const jobInclude = {
    episode: {
      select: {
        id: true,
        title: true,
        podcast: { select: { user: { select: { id: true, email: true } } } },
      },
    },
  } as const;

  const failed = await prisma.processingJob.findMany({
    where: { status: "FAILED", createdAt: { gte: sevenDaysAgo() } },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: jobInclude,
  });
  const active = await prisma.processingJob.findMany({
    where: { status: { in: ["PENDING", "RUNNING"] } },
    orderBy: { createdAt: "asc" },
    take: 30,
    include: jobInclude,
  });

  return (
    <>
      <div className="admin-page-head">
        <div>
          <h1 className="admin-title">santé du pipeline</h1>
          <p className="admin-subtitle">Les traitements en cours et ceux qui ont échoué cette semaine.</p>
        </div>
      </div>

      <section className="admin-section">
        <h2 className="admin-section-title">échecs, 7 derniers jours ({failed.length})</h2>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Étape</th>
                <th>Utilisateur</th>
                <th>Erreur</th>
              </tr>
            </thead>
            <tbody>
              {failed.length === 0 && (
                <tr>
                  <td colSpan={4} className="admin-empty">
                    Aucun échec cette semaine.
                  </td>
                </tr>
              )}
              {failed.map((job) => {
                const user = job.episode.podcast.user;
                return (
                  <tr key={job.id}>
                    <td>{formatDateTime(job.createdAt)}</td>
                    <td>{JOB_LABELS[job.type] ?? job.type}</td>
                    <td>
                      <Link href={`/admin/users/${user.id}`} className="admin-link">
                        {user.email}
                      </Link>
                    </td>
                    <td style={{ whiteSpace: "normal", minWidth: 320, padding: "10px 16px" }}>
                      {job.errorMessage ?? "Aucun message d'erreur"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-section">
        <h2 className="admin-section-title">en attente et en cours ({active.length})</h2>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Créé le</th>
                <th>Étape</th>
                <th>Utilisateur</th>
                <th>Statut</th>
                <th className="num">Avancement</th>
              </tr>
            </thead>
            <tbody>
              {active.length === 0 && (
                <tr>
                  <td colSpan={5} className="admin-empty">
                    File d&apos;attente vide.
                  </td>
                </tr>
              )}
              {active.map((job) => {
                const user = job.episode.podcast.user;
                return (
                  <tr key={job.id}>
                    <td>{formatDateTime(job.createdAt)}</td>
                    <td>{JOB_LABELS[job.type] ?? job.type}</td>
                    <td>
                      <Link href={`/admin/users/${user.id}`} className="admin-link">
                        {user.email}
                      </Link>
                    </td>
                    <td>
                      <Pill tone={job.status === "RUNNING" ? "blue" : "neutral"}>
                        {job.status === "RUNNING" ? "En cours" : "En attente"}
                      </Pill>
                    </td>
                    <td className="num">{job.progressPercent != null ? `${job.progressPercent} %` : "Sans objet"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
