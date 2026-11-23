"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PodcastHostingForm, type HostingValues } from "@/components/PodcastHostingForm";
import { MigrationAssistant } from "@/components/MigrationAssistant";
import { PLATFORMS } from "@/lib/rssConstants";

type Status = "none" | "pending" | "live";
type Links = Partial<Record<"apple" | "spotify" | "deezer", { url?: string; status: Status }>>;

const STATUS_STYLE: Record<Status, string> = {
  none: "bg-[#F4F1EC] text-text-muted",
  pending: "bg-amber-100 text-amber-800",
  live: "bg-green-100 text-green-800",
};

const card = "rounded-xl border border-border bg-white p-5";
const pillBtn =
  "text-xs font-semibold rounded-pill bg-white border border-border px-3 py-1.5 hover:bg-[#FAFAF8] transition disabled:opacity-50 disabled:cursor-not-allowed";

// Hébergement audio du podcast par naocast (Mon podcast, Sources de diffusion) : choix migrer ou démarrer, infos du
// podcast pour les plateformes, flux RSS et état de chaque plateforme. La publication d'un épisode se fait, elle,
// dans la Diffusion de l'épisode.
export function AudioHostingSettings(props: {
  hostingMode: "NAOCAST" | "MIGRATE" | null;
  hosting: HostingValues;
  missing: string[];
  feedUrl: string | null;
  platformLinks: Links;
  migrationStatus: string | null;
  migrationFeedUrl: string | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState(props.hostingMode);
  const [missing, setMissing] = useState(props.missing);
  const [links, setLinks] = useState<Links>(props.platformLinks);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

  async function updateLink(key: "apple" | "spotify" | "deezer", status: Status) {
    const next = { ...links, [key]: { status, url: links[key]?.url } };
    setLinks(next);
    await patchPodcast({ platformLinks: { [key]: next[key] } }).catch((err) => setError((err as Error).message));
  }

  async function copyFeed() {
    if (!props.feedUrl) return;
    await navigator.clipboard.writeText(props.feedUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const title = (
    <div className="mb-3">
      <h2 className="text-sm font-semibold text-ink">Hébergement audio</h2>
    </div>
  );

  if (!mode) {
    return (
      <section>
        {title}
        <p className="mb-3 text-sm text-text-muted">Pour que ton podcast soit écouté sur Apple Podcasts, Spotify et Deezer, il lui faut un hébergeur audio.</p>
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
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </section>
    );
  }

  if (mode === "MIGRATE" && props.migrationStatus !== "DONE") {
    return (
      <section>
        {title}
        <MigrationAssistant
          migrationStatus={props.migrationStatus}
          migrationFeedUrl={props.migrationFeedUrl}
          feedUrl={props.feedUrl}
          onBack={() => chooseMode(null)}
        />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Hébergement audio</h2>
        {props.migrationStatus !== "DONE" && (
          <button type="button" onClick={() => chooseMode(null)} className="text-xs text-text-muted hover:text-ink underline">
            Changer de mode
          </button>
        )}
      </div>

      <div className={card}>
        <p className="font-semibold text-ink">Informations pour les plateformes</p>
        <p className="mt-1 text-xs text-text-muted">Demandées par Apple Podcasts, Spotify et Deezer. Le titre et la pochette sont repris de ton podcast.</p>
        {missing.some((m) => m.startsWith("pochette")) && <p className="mt-2 text-sm text-amber-800">Il manque la pochette : ajoute-la dans la Bibliothèque de médias.</p>}
        <div className="mt-4 max-w-2xl">
          <PodcastHostingForm initial={props.hosting} onSaved={setMissing} />
        </div>
      </div>

      {missing.length === 0 && (
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
            <p className="text-xs text-text-muted">
              {props.migrationStatus === "DONE"
                ? "Tes plateformes suivent la redirection depuis ton ancien flux : tu n'as rien à soumettre. Note ici leur état pour t'y retrouver."
                : "À faire une seule fois : colle le flux ci-dessus dans chaque outil."}
            </p>
            <div className="mt-2 divide-y divide-border">
              {PLATFORMS.map((p) => {
                const status = links[p.key]?.status ?? "none";
                return (
                  <div key={p.key} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div>
                      <p className="text-sm font-semibold text-ink">{p.label}</p>
                      <p className="text-xs text-text-muted">{p.tool}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        aria-label={`État sur ${p.label}`}
                        value={status}
                        onChange={(e) => updateLink(p.key, e.target.value as Status)}
                        className={`cursor-pointer rounded-pill border-0 px-3 py-1 text-xs font-semibold ${STATUS_STYLE[status]}`}
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
        </>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}
