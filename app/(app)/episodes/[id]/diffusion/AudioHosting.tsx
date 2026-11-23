"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RichTextEditor } from "@/components/RichTextEditor";
import { PodcastHostingForm, type HostingValues } from "@/components/PodcastHostingForm";
import { PLATFORMS } from "@/lib/rssConstants";

type Status = "none" | "pending" | "live";
type Links = Partial<Record<"apple" | "spotify" | "deezer", { url?: string; status: Status }>>;

const STATUS_LABEL: Record<Status, string> = { none: "Pas encore soumis", pending: "En attente", live: "Publié" };
const STATUS_STYLE: Record<Status, string> = {
  none: "bg-[#F4F1EC] text-text-muted",
  pending: "bg-amber-100 text-amber-800",
  live: "bg-green-100 text-green-800",
};

const card = "rounded-xl border border-border bg-white p-4";
const pillBtn =
  "text-xs font-semibold rounded-pill bg-white border border-border px-3 py-1.5 hover:bg-[#FAFAF8] transition disabled:opacity-50 disabled:cursor-not-allowed";

// Onglet « Audio » de la Diffusion : hébergement du podcast par naocast (flux RSS pour Apple, Spotify, Deezer)
// et publication de l'épisode dans ce flux.
export function AudioHosting(props: {
  episodeId: string;
  hostingMode: "NAOCAST" | "MIGRATE" | null;
  hosting: HostingValues;
  missing: string[];
  feedUrl: string | null;
  platformLinks: Links;
  audioReady: boolean;
  published: boolean;
  description: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState(props.hostingMode);
  const [missing, setMissing] = useState(props.missing);
  const [links, setLinks] = useState<Links>(props.platformLinks);
  const [published, setPublished] = useState(props.published);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const descRef = useRef<string>(props.description);
  const [descState, setDescState] = useState<"idle" | "saving" | "saved">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function patchPodcast(body: object) {
    const res = await fetch("/api/podcast/hosting", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || "Échec de l'enregistrement.");
    return data as { missing: string[]; feedUrl: string | null };
  }

  async function chooseMode(next: "NAOCAST" | "MIGRATE" | null) {
    setError(null);
    try {
      const data = await patchPodcast({ hostingMode: next });
      setMode(next);
      setMissing(data.missing);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function saveDescription(html: string) {
    descRef.current = html;
    setDescState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      await fetch(`/api/episodes/${props.episodeId}/audio`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description: html }) });
      setDescState("saved");
    }, 700);
  }

  async function setPublishedState(next: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/episodes/${props.episodeId}/audio`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publish: next }) });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Échec.");
      setPublished(next);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function updateLink(key: "apple" | "spotify" | "deezer", patch: { url?: string; status?: Status }) {
    const next = { ...links, [key]: { status: links[key]?.status ?? "none", url: links[key]?.url, ...patch } };
    setLinks(next);
    await patchPodcast({ platformLinks: { [key]: next[key] } }).catch((err) => setError((err as Error).message));
  }

  async function copyFeed() {
    if (!props.feedUrl) return;
    await navigator.clipboard.writeText(props.feedUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!mode) {
    return (
      <section className="space-y-3">
        <h2 className="text-lg font-bold">Audio</h2>
        <p className="text-sm text-text-muted">Pour que ton podcast soit écouté sur Apple Podcasts, Spotify et Deezer, il lui faut un hébergeur audio.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => chooseMode("MIGRATE")} className={`${card} text-left hover:bg-[#FAFAF8] transition`}>
            <p className="font-semibold text-ink">Migrer mon podcast sur naocast</p>
            <p className="mt-1 text-sm text-text-muted">Tu as déjà un hébergeur. On reprend tes épisodes et tes abonnés suivent.</p>
          </button>
          <button type="button" onClick={() => chooseMode("NAOCAST")} className={`${card} text-left hover:bg-[#FAFAF8] transition`}>
            <p className="font-semibold text-ink">Je n&apos;ai pas encore d&apos;hébergeur</p>
            <p className="mt-1 text-sm text-text-muted">Utiliser naocast pour héberger et diffuser ton podcast.</p>
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </section>
    );
  }

  if (mode === "MIGRATE") {
    return (
      <section className="space-y-3">
        <h2 className="text-lg font-bold">Audio</h2>
        <div className={card}>
          <p className="font-semibold text-ink">Migration de ton podcast</p>
          <p className="mt-1 text-sm text-text-muted">L&apos;assistant de migration (import de ton flux actuel, rapprochement des épisodes, copie des fichiers audio) arrive bientôt.</p>
          <button type="button" onClick={() => chooseMode(null)} className={`${pillBtn} mt-3`}>Retour</button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Audio</h2>
        <button type="button" onClick={() => chooseMode(null)} className="text-xs text-text-muted hover:text-ink underline">Changer de mode</button>
      </div>

      {missing.length > 0 ? (
        <div className={card}>
          <p className="font-semibold text-ink">Infos du podcast pour les plateformes</p>
          <p className="mt-1 text-sm text-text-muted">Apple, Spotify et Deezer demandent ces informations. Le titre et la pochette sont déjà repris de ton podcast.</p>
          {missing.some((m) => m.startsWith("pochette")) && <p className="mt-2 text-sm text-amber-800">Il manque la pochette : ajoute-la dans Mon podcast, Bibliothèque de médias.</p>}
          <div className="mt-4">
            <PodcastHostingForm initial={props.hosting} onSaved={setMissing} />
          </div>
        </div>
      ) : (
        <>
          <div className={card}>
            <p className="text-xs text-text-muted">Flux RSS de ton podcast</p>
            <div className="mt-1 flex gap-2">
              <input readOnly value={props.feedUrl ?? ""} className="flex-1 rounded-lg border border-border bg-[#FAFAF8] px-3 py-2 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
              <button type="button" onClick={copyFeed} className={pillBtn}>{copied ? "Copié" : "Copier"}</button>
            </div>
            <p className="mt-2 text-xs text-text-muted">Les plateformes lisent ce flux toutes seules. Chaque épisode publié y apparaît.</p>
          </div>

          <div className={card}>
            <p className="font-semibold text-ink">Plateformes</p>
            <p className="text-xs text-text-muted">À faire une seule fois : colle le flux ci-dessus dans chaque outil.</p>
            <div className="mt-2 divide-y divide-border">
              {PLATFORMS.map((p) => {
                const link = links[p.key];
                const status = link?.status ?? "none";
                return (
                  <div key={p.key} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div>
                      <p className="text-sm font-semibold text-ink">{p.label}</p>
                      <p className="text-xs text-text-muted">{p.tool}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-pill px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>
                      <select
                        aria-label={`État sur ${p.label}`}
                        value={status}
                        onChange={(e) => updateLink(p.key, { status: e.target.value as Status })}
                        className="rounded-lg border border-border bg-white px-2 py-1 text-xs"
                      >
                        <option value="none">Pas encore soumis</option>
                        <option value="pending">En attente</option>
                        <option value="live">Publié</option>
                      </select>
                      <a href={p.href} target="_blank" rel="noreferrer" className={pillBtn}>Ouvrir ↗</a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className={card}>
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-ink">Cet épisode</p>
              <span className={`rounded-pill px-2.5 py-0.5 text-xs font-semibold ${published ? STATUS_STYLE.live : STATUS_STYLE.none}`}>{published ? "Dans le flux" : "Pas dans le flux"}</span>
            </div>
            <p className="mt-3 text-xs font-semibold text-text-muted">Description de l&apos;épisode</p>
            <div className="mt-1">
              <RichTextEditor initialContent={props.description} placeholder="Ce que l'auditeur va trouver dans cet épisode…" onChange={saveDescription} minHeight={160} />
            </div>
            <p className="mt-1 h-4 text-xs text-text-muted">{descState === "saving" ? "Enregistrement…" : descState === "saved" ? "Enregistré" : "Gras, italique et listes sont conservés sur les plateformes."}</p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-xs text-text-muted">
                {props.audioReady ? "L'audio est prêt, il vient de l'épisode final validé." : "L'audio n'est pas prêt : dépose l'épisode final dans Montage."}
              </p>
              {published ? (
                <button type="button" disabled={busy} onClick={() => setPublishedState(false)} className={pillBtn}>Retirer du flux</button>
              ) : (
                <button
                  type="button"
                  disabled={busy || !props.audioReady}
                  onClick={() => setPublishedState(true)}
                  className="text-sm font-semibold rounded-pill bg-primary-button text-white px-4 py-2 hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Publier dans le flux
                </button>
              )}
            </div>
          </div>
        </>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}
