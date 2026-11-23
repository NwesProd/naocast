"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Snapshot {
  day: string;
  views: number;
  likes: number | null;
  comments: number | null;
}
interface UploadedVideo {
  videoId: string;
  title: string;
  publishedAt: string;
}

const pillBtn =
  "text-xs font-semibold rounded-pill bg-white border border-border px-3 py-1.5 hover:bg-[#FAFAF8] transition disabled:opacity-50 disabled:cursor-not-allowed";

const nf = new Intl.NumberFormat("fr-FR");

// Miniature d'une vidéo YouTube : adresse publique à partir de son identifiant, sans appel à l'API.
const thumb = (videoId: string, size: "mq" | "hq") => `https://i.ytimg.com/vi/${videoId}/${size}default.jpg`;

function formatDay(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-white p-4">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="mt-0.5 text-2xl font-bold text-ink">{value}</p>
      {hint && <p className="text-xs text-text-muted">{hint}</p>}
    </div>
  );
}

// Courbe des vues cumulées, un point par relevé quotidien.
function ViewsChart({ snapshots }: { snapshots: Snapshot[] }) {
  const width = 640;
  const height = 150;
  const padX = 36;
  const max = Math.max(...snapshots.map((s) => s.views), 1);
  const x = (i: number) => padX + (i / Math.max(snapshots.length - 1, 1)) * (width - padX - 10);
  const y = (v: number) => 14 + (1 - v / max) * (height - 44);
  const points = snapshots.map((s, i) => `${x(i)},${y(s.views)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label="Évolution des vues YouTube jour après jour">
      <line x1={padX} y1={height - 30} x2={width - 10} y2={height - 30} stroke="#EEEAE4" strokeWidth="1" />
      <line x1={padX} y1={14} x2={width - 10} y2={14} stroke="#EEEAE4" strokeWidth="1" strokeDasharray="3 4" />
      <text x="2" y="18" fontSize="11" fill="#8A857D">{nf.format(max)}</text>
      <text x="2" y={height - 26} fontSize="11" fill="#8A857D">0</text>
      <polyline fill="none" stroke="#378ADD" strokeWidth="2.5" strokeLinejoin="round" points={points} />
      {snapshots.map((s, i) => (
        <circle key={s.day} cx={x(i)} cy={y(s.views)} r="3.5" fill="#378ADD" />
      ))}
      <text x={padX} y={height - 8} fontSize="11" fill="#8A857D">{formatDay(snapshots[0].day)}</text>
      <text x={width - 10} y={height - 8} fontSize="11" fill="#8A857D" textAnchor="end">{formatDay(snapshots[snapshots.length - 1].day)}</text>
    </svg>
  );
}

// Module « Diffusion » : statistiques de l'épisode. YouTube (vues, likes, commentaires et leur
// évolution) ; les écoutes audio viendront avec les hébergeurs.
export function DiffusionClient({
  episodeId,
  connected,
  channelTitle,
  apiConfigured,
  video,
  releaseDate,
  snapshots,
}: {
  episodeId: string;
  connected: boolean;
  channelTitle: string | null;
  apiConfigured: boolean;
  video: { id: string; title: string } | null;
  releaseDate: string | null;
  snapshots: Snapshot[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(connected && !video && apiConfigured);
  const [notFound, setNotFound] = useState(false);
  const [picking, setPicking] = useState(false);
  const [uploads, setUploads] = useState<UploadedVideo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const matched = useRef(false);

  async function post(body: Record<string, unknown>): Promise<Response | null> {
    setError(null);
    try {
      const res = await fetch(`/api/episodes/${episodeId}/diffusion`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "Action impossible.");
      return res;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }

  // Première visite : la vidéo est retrouvée toute seule par le titre de l'épisode.
  useEffect(() => {
    if (!connected || video || !apiConfigured || matched.current) return;
    matched.current = true;
    (async () => {
      const res = await post({ action: "match" });
      setSearching(false);
      if (!res) return;
      const data = (await res.json()) as { matched: boolean };
      if (data.matched) router.refresh();
      else setNotFound(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, video, apiConfigured]);

  async function refresh() {
    setBusy(true);
    const res = await post({ action: "refresh" });
    setBusy(false);
    if (res) router.refresh();
  }

  async function openPicker() {
    setPicking(true);
    if (uploads) return;
    setError(null);
    try {
      const res = await fetch("/api/podcast/youtube/videos");
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "Impossible de lister les vidéos.");
      setUploads((await res.json()) as UploadedVideo[]);
    } catch (e) {
      setError((e as Error).message);
      setPicking(false);
    }
  }

  async function choose(videoId: string | null) {
    setBusy(true);
    const res = await post({ action: "set", videoId });
    setBusy(false);
    if (!res) return;
    setPicking(false);
    setNotFound(false);
    router.refresh();
  }

  const latest = snapshots[snapshots.length - 1] ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-ink">Diffusion</h1>
        {video && (
          <div className="flex items-center gap-3">
            {latest && <span className="text-xs text-text-muted">Dernier relevé : {formatDay(latest.day)}</span>}
            <button type="button" onClick={refresh} disabled={busy} className={pillBtn}>
              {busy ? "..." : "Actualiser"}
            </button>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-[#8A2E1F]">{error}</p>}

      {!connected && (
        <section className="space-y-2 rounded-xl border border-border bg-white p-5">
          <h2 className="text-sm font-semibold text-ink">Connecte ta chaîne YouTube</h2>
          <p className="text-sm text-text-muted">Colle l&apos;adresse de ta chaîne : naocast lit les vues, likes et commentaires publics de chaque vidéo, sans connexion à ton compte Google.</p>
          <Link href="/podcast" className={`${pillBtn} inline-block`}>
            Aller dans Mon podcast
          </Link>
        </section>
      )}

      {connected && !apiConfigured && (
        <p className="rounded-md bg-peach p-3 text-sm text-peach-ink">Les statistiques YouTube ne sont pas encore activées sur naocast. Elles arrivent bientôt.</p>
      )}

      {connected && apiConfigured && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Vues YouTube" value={latest ? nf.format(latest.views) : "-"} />
            <StatCard label="Likes" value={latest?.likes != null ? nf.format(latest.likes) : "-"} />
            <StatCard label="Commentaires" value={latest?.comments != null ? nf.format(latest.comments) : "-"} />
            <StatCard label="Écoutes audio" value="-" hint="Bientôt, avec les hébergeurs" />
          </div>

          {video && (
            <section className="space-y-3 rounded-xl border border-border bg-white p-5">
              <h2 className="text-sm font-semibold text-ink">Évolution des vues{releaseDate ? ` depuis la sortie (${formatDay(releaseDate)})` : ""}</h2>
              {snapshots.length >= 2 ? (
                <ViewsChart snapshots={snapshots} />
              ) : (
                <p className="text-sm text-text-muted">La courbe se construit jour après jour : naocast relève les chiffres chaque jour à partir d&apos;aujourd&apos;hui.</p>
              )}
            </section>
          )}

          <section className="space-y-3 rounded-xl border border-border bg-white p-5">
            <h2 className="text-sm font-semibold text-ink">Vidéo YouTube{channelTitle ? ` de ${channelTitle}` : ""}</h2>
            {searching && <p className="text-sm text-text-muted">Recherche de la vidéo de cet épisode...</p>}
            {video ? (
              <div className="flex flex-wrap items-center gap-4">
                <a href={`https://www.youtube.com/watch?v=${video.id}`} target="_blank" rel="noreferrer" className="shrink-0" title="Ouvrir la vidéo sur YouTube">
                  {/* eslint-disable-next-line @next/next/no-img-element -- miniature YouTube servie par i.ytimg.com */}
                  <img src={thumb(video.id, "hq")} alt={video.title} className="aspect-video w-56 rounded-md border border-border object-cover" />
                </a>
                <div className="min-w-0 flex-1 space-y-3">
                  <a href={`https://www.youtube.com/watch?v=${video.id}`} target="_blank" rel="noreferrer" className="block text-sm font-medium text-ink underline">
                    {video.title}
                  </a>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={openPicker} disabled={busy} className={pillBtn}>
                      Choisir une autre vidéo
                    </button>
                    <button type="button" onClick={() => choose(null)} disabled={busy} className={pillBtn}>
                      Retirer
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              !searching && (
                <div className="space-y-2">
                  {notFound && <p className="text-sm text-text-muted">Aucune vidéo ne correspond au titre de cet épisode. Choisis-la dans ta chaîne.</p>}
                  <button type="button" onClick={openPicker} disabled={busy} className={pillBtn}>
                    Choisir la vidéo
                  </button>
                </div>
              )
            )}

            {picking && (
              <div className="rounded-md border border-border">
                {uploads === null ? (
                  <p className="p-3 text-sm text-text-muted">Chargement des vidéos...</p>
                ) : (
                  <ul className="max-h-72 divide-y divide-border overflow-y-auto text-sm">
                    {uploads.map((v) => (
                      <li key={v.videoId}>
                        <button type="button" onClick={() => choose(v.videoId)} disabled={busy} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-[#FAFAF8]">
                          {/* eslint-disable-next-line @next/next/no-img-element -- miniature YouTube servie par i.ytimg.com */}
                          <img src={thumb(v.videoId, "mq")} alt="" className="aspect-video w-24 shrink-0 rounded border border-border object-cover" loading="lazy" />
                          <span className="min-w-0 flex-1 truncate text-ink">{v.title}</span>
                          <span className="shrink-0 text-xs text-text-muted">{v.publishedAt ? new Date(v.publishedAt).toLocaleDateString("fr-FR") : ""}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
