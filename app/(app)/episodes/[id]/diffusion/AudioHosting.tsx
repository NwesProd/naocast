"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RichTextEditor } from "@/components/RichTextEditor";

const card = "rounded-xl border border-border bg-white p-4";
const pillBtn =
  "text-xs font-semibold rounded-pill bg-white border border-border px-3 py-1.5 hover:bg-[#FAFAF8] transition disabled:opacity-50 disabled:cursor-not-allowed";
const primaryBtn =
  "text-sm font-semibold rounded-pill bg-primary-button text-white px-4 py-2 hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed";

// Valeur d'un champ « datetime-local » (heure locale du navigateur) à partir d'une date ISO.
function toLocalInput(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date(Date.now() + 24 * 3600 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Onglet « Audio » de la Diffusion d'un épisode : titre et description affichés sur les plateformes, et publication de
// l'épisode dans le flux du podcast (tout de suite ou à une date). L'hébergement lui-même se règle dans Mon podcast.
export function AudioHosting(props: {
  episodeId: string;
  hostingReady: boolean;
  audioReady: boolean;
  publishedAt: string | null;
  serverNow: number;
  description: string;
  audioTitle: string;
  episodeTitle: string;
}) {
  const router = useRouter();
  const [publishedAt, setPublishedAt] = useState<string | null>(props.publishedAt);
  const [scheduling, setScheduling] = useState(false);
  const [when, setWhen] = useState(toLocalInput(null));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [descState, setDescState] = useState<"idle" | "saving" | "saved">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [audioTitle, setAudioTitle] = useState(props.audioTitle);
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isLive = !!publishedAt && new Date(publishedAt).getTime() <= props.serverNow;
  const isScheduled = !!publishedAt && !isLive;

  function patch(body: object) {
    return fetch(`/api/episodes/${props.episodeId}/audio`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  }

  function saveTitle(value: string) {
    setAudioTitle(value);
    if (titleTimer.current) clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(() => patch({ title: value }).catch(() => {}), 700);
  }

  function saveDescription(html: string) {
    setDescState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      await patch({ description: html });
      setDescState("saved");
    }, 700);
  }

  async function update(body: object) {
    setBusy(true);
    setError(null);
    try {
      const res = await patch(body);
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Échec.");
      setPublishedAt(data.audioPublishedAt ?? null);
      setScheduling(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!props.hostingReady) {
    return (
      <section className={card}>
        <p className="font-semibold text-ink">Configure d&apos;abord l&apos;hébergement audio</p>
        <p className="mt-1 text-sm text-text-muted">
          Pour diffuser tes épisodes sur Apple Podcasts, Spotify et Deezer, choisis ton mode d&apos;hébergement et complète les informations du podcast.
        </p>
        <Link href="/podcast" className={`${pillBtn} mt-3 inline-block`}>
          Aller dans Mon podcast
        </Link>
      </section>
    );
  }

  return (
    <section className={`${card} space-y-1`}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-ink">Cet épisode</p>
        {isLive && <span className="rounded-pill bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800">Dans le flux</span>}
        {isScheduled && (
          <span className="rounded-pill bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
            Planifié le {new Date(publishedAt!).toLocaleString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
        {!publishedAt && <span className="rounded-pill bg-[#F4F1EC] px-2.5 py-0.5 text-xs font-semibold text-text-muted">Pas dans le flux</span>}
      </div>

      <p className="pt-2 text-xs font-semibold text-text-muted">Titre</p>
      <input
        value={audioTitle}
        onChange={(e) => saveTitle(e.target.value)}
        placeholder={props.episodeTitle || "Titre de l'épisode"}
        className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:border-primary-button"
      />
      <p className="pb-2 text-xs text-text-muted">Le titre affiché sur Apple, Spotify et Deezer. Laisse vide pour reprendre le titre de l&apos;épisode.</p>

      <p className="text-xs font-semibold text-text-muted">Description de l&apos;épisode</p>
      <RichTextEditor initialContent={props.description} placeholder="Ce que l'auditeur va trouver dans cet épisode…" onChange={saveDescription} minHeight={160} />
      <p className="h-4 text-xs text-text-muted">{descState === "saving" ? "Enregistrement…" : descState === "saved" ? "Enregistré" : "Gras, italique et listes sont conservés sur les plateformes."}</p>

      <div className="space-y-3 border-t border-border pt-3">
        <p className="text-xs text-text-muted">
          {props.audioReady ? "L'audio est prêt, il vient de l'épisode final validé." : "L'audio n'est pas prêt : dépose l'épisode final dans Montage."}
        </p>
        {scheduling && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-semibold text-text-muted" htmlFor="publish-at">Publier le</label>
            <input
              id="publish-at"
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm focus:outline-none focus:border-primary-button"
            />
            <button type="button" disabled={busy || !when} onClick={() => update({ publishAt: new Date(when).toISOString() })} className={primaryBtn}>
              Planifier
            </button>
            <button type="button" onClick={() => setScheduling(false)} className={pillBtn}>
              Annuler
            </button>
          </div>
        )}
        {!scheduling && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {publishedAt && (
              <button type="button" disabled={busy} onClick={() => update({ publish: false })} className={pillBtn}>
                {isScheduled ? "Annuler la planification" : "Retirer du flux"}
              </button>
            )}
            <button
              type="button"
              disabled={busy || !props.audioReady}
              onClick={() => {
                setWhen(toLocalInput(isScheduled ? publishedAt : null));
                setScheduling(true);
              }}
              className={pillBtn}
            >
              {isScheduled ? "Changer la date" : "Planifier"}
            </button>
            {!isLive && (
              <button type="button" disabled={busy || !props.audioReady} onClick={() => update({ publish: true })} className={primaryBtn}>
                Publier maintenant
              </button>
            )}
          </div>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}
