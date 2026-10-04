import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { getSignedDownloadUrl } from "@/lib/storage";
import { buildEditingSummary, formatMs } from "@/lib/editingRequest";
import { Pill, StatusPill, formatBytes, formatDate, formatDateTime } from "../../ui";

export default async function AdminMontagePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;

  const request = await prisma.editingRequest.findUnique({ where: { id } });
  if (!request) notFound();

  const episode = request.episodeId ? await prisma.episode.findUnique({ where: { id: request.episodeId }, select: { status: true } }) : null;
  const summary = request.episodeId ? await buildEditingSummary(request.episodeId) : null;

  // Liens de téléchargement des rushs (valables 6 h, générés à l'ouverture de la page).
  const rushes = summary
    ? await Promise.all(
        summary.rushes.map(async (r) => ({
          ...r,
          url: r.storageKey ? await getSignedDownloadUrl(r.storageKey, 6 * 3600).catch(() => null) : null,
        }))
      )
    : [];

  const title = `${summary?.episodeCode ? `${summary.episodeCode} ` : ""}${summary?.episodeTitle ?? request.episodeTitle ?? "Sans titre"}`;
  const amount = request.amountTotal != null ? `${(request.amountTotal / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2 })} ${(request.currency || "eur").toUpperCase()}` : null;

  return (
    <>
      <div className="admin-page-head">
        <div>
          <p className="admin-subtitle" style={{ margin: "0 0 8px" }}>
            <Link href="/admin/montages" className="admin-link">
              Montages
            </Link>
          </p>
          <h1 className="admin-title" style={{ textTransform: "none" }}>
            {title}
          </h1>
          <p className="admin-subtitle">
            {request.podcastTitle ?? summary?.podcastTitle ?? "Podcast"} · demande du {formatDate(request.createdAt)}
          </p>
        </div>
        {request.status === "PAID" ? <Pill tone="success">Payé</Pill> : <Pill tone="orange">Paiement en attente</Pill>}
      </div>

      <section className="admin-section">
        <div className="admin-grid cols-2">
          <div className="admin-card">
            <h2 className="admin-section-title">demande</h2>
            <dl className="admin-kv">
              <dt>Podcasteur</dt>
              <dd>
                <Link href={`/admin/users/${request.userId}`} className="admin-link">
                  {request.userEmail}
                </Link>
              </dd>
              <dt>Paiement</dt>
              <dd>{request.status === "PAID" ? `${amount ?? "Payé"}, le ${request.paidAt ? formatDateTime(request.paidAt) : "?"}` : "Non finalisé"}</dd>
              <dt>Email à l&apos;équipe</dt>
              <dd>{request.emailSentAt ? `Envoyé le ${formatDateTime(request.emailSentAt)}` : "Pas encore envoyé"}</dd>
              <dt>Épisode</dt>
              <dd>{episode ? <StatusPill status={episode.status} /> : "Supprimé"}</dd>
              {summary?.releaseDate && (
                <>
                  <dt>Sortie prévue</dt>
                  <dd>{formatDate(summary.releaseDate)}</dd>
                </>
              )}
              {request.stripeSessionId && (
                <>
                  <dt>Stripe</dt>
                  <dd>
                    <a href={`https://dashboard.stripe.com/payments?query=${request.stripeSessionId}`} target="_blank" rel="noreferrer" className="admin-link">
                      Voir dans Stripe
                    </a>
                  </dd>
                </>
              )}
            </dl>
          </div>
          <div className="admin-card">
            <h2 className="admin-section-title">remarques du podcasteur</h2>
            {request.notes ? <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{request.notes}</p> : <p className="admin-help">Aucune remarque.</p>}
          </div>
        </div>
      </section>

      {!summary ? (
        <p className="admin-message error">L&apos;épisode a été supprimé : le détail du montage n&apos;est plus disponible.</p>
      ) : (
        <>
          <section className="admin-section">
            <h2 className="admin-section-title">rushs ({rushes.length})</h2>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Fichier</th>
                    <th className="num">Durée</th>
                    <th className="num">Poids</th>
                    <th>Retenu</th>
                    <th>Téléchargement</th>
                  </tr>
                </thead>
                <tbody>
                  {rushes.length === 0 && (
                    <tr>
                      <td colSpan={5} className="admin-empty">
                        Aucun rush.
                      </td>
                    </tr>
                  )}
                  {rushes.map((r) => (
                    <tr key={r.id}>
                      <td>{r.name}</td>
                      <td className="num">{r.durationSec ? formatMs(r.durationSec * 1000) : "?"}</td>
                      <td className="num">{r.sizeBytes != null ? formatBytes(r.sizeBytes) : "?"}</td>
                      <td>{r.selected ? "Oui" : "Non"}</td>
                      <td>
                        {r.url ? (
                          <a href={r.url} className="admin-link">
                            Télécharger
                          </a>
                        ) : r.externalRef ? (
                          <a href={r.externalRef} target="_blank" rel="noreferrer" className="admin-link">
                            Lien externe ({r.type.toLowerCase()})
                          </a>
                        ) : (
                          "Indisponible"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {summary.cameraSetup && <p className="admin-help">{summary.cameraSetup}</p>}
          </section>

          <section className="admin-section">
            <div className="admin-grid cols-2">
              <div className="admin-card">
                <h2 className="admin-section-title">voix et transcript</h2>
                <dl className="admin-kv">
                  <dt>Voix attendues</dt>
                  <dd>{summary.expectedSpeakerCount ?? "Non précisé"}</dd>
                  <dt>Locuteurs</dt>
                  <dd>{summary.speakers.length ? summary.speakers.join(", ") : "Aucun nommé"}</dd>
                  <dt>Transcript</dt>
                  <dd>{summary.hasTranscript ? "Disponible" : "Non généré"}</dd>
                </dl>
              </div>
              <div className="admin-card">
                <h2 className="admin-section-title">intro, génériques, logo</h2>
                <dl className="admin-kv">
                  <dt>Intro</dt>
                  <dd>{summary.intro}</dd>
                  {summary.generics.map((g) => (
                    <div key={g.label} style={{ display: "contents" }}>
                      <dt>Générique {g.label.toLowerCase()}</dt>
                      <dd>{g.text}</dd>
                    </div>
                  ))}
                  <dt>Logo</dt>
                  <dd>{summary.logo}</dd>
                </dl>
              </div>
            </div>
          </section>

          <section className="admin-section">
            <h2 className="admin-section-title">coupes ({summary.cuts.length})</h2>
            <p className="admin-help">{summary.autocut}</p>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>De</th>
                    <th>À</th>
                    <th>Durée</th>
                    <th>Origine</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.cuts.length === 0 && (
                    <tr>
                      <td colSpan={4} className="admin-empty">
                        Aucune coupe.
                      </td>
                    </tr>
                  )}
                  {summary.cuts.map((c, i) => (
                    <tr key={i}>
                      <td>{formatMs(c.startMs)}</td>
                      <td>{formatMs(c.endMs)}</td>
                      <td>{((c.endMs - c.startMs) / 1000).toFixed(1).replace(".", ",")} s</td>
                      <td>{c.source === "AUTOCUT" ? "Silence" : "Manuelle"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
