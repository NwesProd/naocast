"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Step = "url" | "verify" | "copy" | "redirect";
type Confidence = "high" | "maybe" | "none";
interface PreviewItem {
  guid: string;
  title: string;
  pubDate: string | null;
  episodeId: string | null;
  confidence: Confidence;
}
interface EpisodeOption {
  id: string;
  title: string;
  code: string;
}
interface Status {
  rows: { id: string; title: string; state: "done" | "pending" | "failed"; error: string | null }[];
  done: number;
  failed: number;
  total: number;
}

const card = "rounded-xl border border-border bg-white p-4";
const pillBtn =
  "text-xs font-semibold rounded-pill bg-white border border-border px-3 py-1.5 hover:bg-[#FAFAF8] transition disabled:opacity-50 disabled:cursor-not-allowed";
const primaryBtn =
  "text-sm font-semibold rounded-pill bg-primary-button text-white px-4 py-2 hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed";
const STEPS: { key: Step; label: string }[] = [
  { key: "url", label: "Importer" },
  { key: "verify", label: "Vérifier" },
  { key: "copy", label: "Copier" },
  { key: "redirect", label: "Rediriger" },
];
const BADGE: Record<Confidence, { label: string; cls: string }> = {
  high: { label: "Reconnu", cls: "bg-green-100 text-green-800" },
  maybe: { label: "À confirmer", cls: "bg-amber-100 text-amber-800" },
  none: { label: "Nouveau", cls: "bg-[#F4F1EC] text-text-muted" },
};

async function call<T>(url: string, method: string, body?: object): Promise<T> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || "Échec.");
  return data as T;
}

// Assistant de migration d'un podcast hébergé ailleurs : import du flux, rapprochement des épisodes, copie des
// fichiers audio, puis redirection de l'ancien flux vers celui de naocast.
export function MigrationAssistant({
  migrationStatus,
  migrationFeedUrl,
  feedUrl,
  onBack,
}: {
  migrationStatus: string | null;
  migrationFeedUrl: string | null;
  feedUrl: string | null;
  onBack: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(migrationStatus === "REDIRECT" ? "redirect" : migrationStatus === "IMPORTING" ? "copy" : "url");
  const [url, setUrl] = useState(migrationFeedUrl ?? "");
  const [items, setItems] = useState<PreviewItem[]>([]);
  const [episodes, setEpisodes] = useState<EpisodeOption[]>([]);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkMsg, setCheckMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (step !== "copy") return;
    let stop = false;
    async function poll() {
      try {
        const data = await call<Status>("/api/podcast/migration/status", "GET");
        if (!stop) setStatus(data);
        if (!stop && data.done + data.failed < data.total) setTimeout(poll, 4000);
      } catch {
        if (!stop) setTimeout(poll, 8000);
      }
    }
    poll();
    return () => {
      stop = true;
    };
  }, [step]);

  async function read() {
    setBusy(true);
    setError(null);
    try {
      const data = await call<{ items: PreviewItem[]; episodes: EpisodeOption[] }>("/api/podcast/migration/preview", "POST", { feedUrl: url.trim() });
      setItems(data.items);
      setEpisodes(data.episodes);
      setChoices(Object.fromEntries(data.items.map((i) => [i.guid, i.episodeId ?? (i.confidence === "none" ? "new" : "")])));
      setStep("verify");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      const list = items.map((i) => ({ guid: i.guid, episodeId: choices[i.guid] === "skip" || !choices[i.guid] ? null : choices[i.guid] }));
      await call("/api/podcast/migration/apply", "POST", { feedUrl: url.trim(), choices: list });
      setStep("copy");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toRedirect() {
    setBusy(true);
    try {
      await call("/api/podcast/migration/check", "POST", { action: "advance" });
      setStep("redirect");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function check() {
    setBusy(true);
    setError(null);
    setCheckMsg(null);
    try {
      const data = await call<{ redirected: boolean }>("/api/podcast/migration/check", "POST", { action: "check" });
      if (data.redirected) router.refresh();
      else setCheckMsg("La redirection n'est pas encore en place chez ton ancien hébergeur. Elle peut prendre quelques minutes.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    setBusy(true);
    try {
      await call("/api/podcast/migration/check", "POST", { action: "finish" });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function retry() {
    await call("/api/podcast/migration/status", "POST").catch(() => {});
    setStatus(null);
    setStep("url");
    setTimeout(() => setStep("copy"), 0);
  }

  const toImport = items.filter((i) => choices[i.guid] && choices[i.guid] !== "skip").length;
  const used = new Map<string, number>();
  Object.values(choices).forEach((v) => v && v !== "new" && v !== "skip" && used.set(v, (used.get(v) ?? 0) + 1));
  const duplicates = [...used.values()].some((n) => n > 1);
  const stepIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-4 gap-2">
        {STEPS.map((s, i) => (
          <div key={s.key} className={`${card} !p-3 ${i === stepIndex ? "border-primary-button" : ""}`}>
            <p className="text-xs text-text-muted">Étape {i + 1}</p>
            <p className={`text-sm font-semibold ${i <= stepIndex ? "text-ink" : "text-text-muted"}`}>{s.label}</p>
          </div>
        ))}
      </div>

      {step === "url" && (
        <div className={card}>
          <p className="text-xs text-text-muted">Adresse de ton flux actuel</p>
          <div className="mt-1 flex gap-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://feeds.exemple.com/mon-podcast"
              className="flex-1 rounded-lg border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:border-primary-button"
            />
            <button type="button" onClick={read} disabled={busy || !url.trim()} className={pillBtn}>
              {busy ? "Lecture…" : "Lire le flux"}
            </button>
          </div>
          <p className="mt-2 text-xs text-text-muted">Tu la trouves chez ton hébergeur actuel, souvent sous « flux RSS » ou « lien RSS ».</p>
          <button type="button" onClick={onBack} className={`${pillBtn} mt-3`}>Retour</button>
        </div>
      )}

      {step === "verify" && (
        <div className={card}>
          <p className="font-semibold text-ink">{items.length} épisodes trouvés dans ton flux</p>
          <p className="mt-1 text-sm text-text-muted">
            naocast a cherché pour chacun l&apos;épisode déjà créé chez toi. Vérifie les lignes orange, et corrige si besoin.
          </p>
          <div className="mt-3 max-h-[28rem] divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {items.map((i) => {
              const value = choices[i.guid] ?? "";
              const conf: Confidence = value === "new" || !value ? "none" : value === i.episodeId ? i.confidence : "high";
              return (
                <div key={i.guid} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{i.title}</p>
                    <p className="text-xs text-text-muted">{i.pubDate ? new Date(i.pubDate).toLocaleDateString("fr-FR") : "Sans date"}</p>
                  </div>
                  <span className={`rounded-pill px-2.5 py-0.5 text-xs font-semibold ${value === "skip" ? "bg-[#F4F1EC] text-text-muted" : BADGE[conf].cls}`}>
                    {value === "skip" ? "Ignoré" : BADGE[conf].label}
                  </span>
                  <select
                    aria-label={`Épisode naocast pour ${i.title}`}
                    value={value}
                    onChange={(e) => setChoices((c) => ({ ...c, [i.guid]: e.target.value }))}
                    className="max-w-[16rem] rounded-lg border border-border bg-white px-2 py-1 text-xs"
                  >
                    {!value && <option value="">Choisir…</option>}
                    <option value="new">Créer un nouvel épisode</option>
                    <option value="skip">Ne pas importer</option>
                    {episodes.map((e) => (
                      <option key={e.id} value={e.id}>{e.code ? `${e.code} · ` : ""}{e.title}</option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
          {duplicates && <p className="mt-2 text-sm text-red-600">Un même épisode naocast est choisi deux fois.</p>}
          <div className="mt-3 flex items-center justify-between gap-2">
            <button type="button" onClick={() => setStep("url")} className={pillBtn}>Retour</button>
            <button type="button" onClick={apply} disabled={busy || toImport === 0 || duplicates} className={primaryBtn}>
              {busy ? "Import…" : `Importer ${toImport} épisode${toImport > 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      )}

      {step === "copy" && (
        <div className={card}>
          <p className="font-semibold text-ink">Copie des fichiers audio</p>
          <p className="mt-1 text-sm text-text-muted">naocast copie chaque épisode depuis ton ancien hébergeur. Tu peux quitter la page, la copie continue.</p>
          {status ? (
            <>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-pill bg-[#EEEAE4]">
                <div className="h-full bg-primary-button transition-all" style={{ width: `${status.total ? Math.round((status.done / status.total) * 100) : 100}%` }} />
              </div>
              <p className="mt-1 text-xs text-text-muted">{status.done} sur {status.total} épisodes copiés</p>
              {status.rows.filter((r) => r.state === "failed").map((r) => (
                <p key={r.id} className="mt-1 text-sm text-red-600">{r.title} : {r.error || "échec de la copie"}</p>
              ))}
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                {status.failed > 0 && <button type="button" onClick={retry} className={pillBtn}>Relancer les copies en échec</button>}
                <button type="button" onClick={toRedirect} disabled={busy || status.done < status.total} className={primaryBtn}>Continuer</button>
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-text-muted">Chargement…</p>
          )}
        </div>
      )}

      {step === "redirect" && (
        <div className={card}>
          <p className="font-semibold text-ink">Redirige ton ancien flux vers naocast</p>
          <p className="mt-1 text-sm text-text-muted">Donne cette adresse à ton ancien hébergeur comme nouveau flux de ton podcast :</p>
          <div className="mt-2 flex gap-2">
            <input readOnly value={feedUrl ?? ""} onFocus={(e) => e.currentTarget.select()} className="flex-1 rounded-lg border border-border bg-[#FAFAF8] px-3 py-2 font-mono text-xs" />
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(feedUrl ?? "").catch(() => {});
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className={pillBtn}
            >
              {copied ? "Copié" : "Copier"}
            </button>
          </div>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-text-muted">
            <li>Chez ton ancien hébergeur, cherche « redirection du flux », « changer d&apos;hébergeur » ou « migrer mon podcast ».</li>
            <li>Indique l&apos;adresse ci-dessus comme nouveau flux.</li>
            <li>Si l&apos;option n&apos;existe pas, écris à son support : demande une redirection 301 du flux RSS et la balise itunes:new-feed-url vers cette adresse.</li>
            <li>Garde ton ancien compte actif quelques semaines : Apple, Spotify et Deezer suivent la redirection en quelques heures à quelques jours.</li>
          </ol>
          {checkMsg && <p className="mt-3 text-sm text-amber-800">{checkMsg}</p>}
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={finish} disabled={busy} className={pillBtn}>Terminer sans vérifier</button>
            <button type="button" onClick={check} disabled={busy} className={primaryBtn}>{busy ? "Vérification…" : "Vérifier la redirection"}</button>
          </div>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}
