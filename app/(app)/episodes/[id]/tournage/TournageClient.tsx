"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { EPISODE_UPDATED_EVENT } from "@/components/SidebarNav";
import { AddressInput } from "@/components/AddressInput";

interface Part {
  title: string;
  html: string;
}
interface Marker {
  id: string;
  atMs: number;
}
interface Guest {
  id: string;
  name: string;
  media: string | null;
  notified: boolean;
}

const pillBtn =
  "text-xs font-semibold rounded-pill bg-white border border-border px-3 py-1.5 hover:bg-[#FAFAF8] transition disabled:opacity-50 disabled:cursor-not-allowed";
const primaryBtn =
  "text-sm font-semibold rounded-[10px] bg-primary-button text-white px-4 py-2 hover:brightness-110 transition disabled:opacity-50 disabled:cursor-not-allowed";
const inputClass = "w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-button/30";

const MODES: { key: "STUDIO" | "HOME" | "REMOTE"; label: string; placeLabel: string }[] = [
  { key: "STUDIO", label: "Studio", placeLabel: "Nom et adresse du studio (ex. Le Studio Unique, 12 rue…)" },
  { key: "HOME", label: "Chez moi", placeLabel: "Adresse" },
  { key: "REMOTE", label: "En visio", placeLabel: "Lien de la visio" },
];

// Couleurs d'avancement des parties du script : terminée (vert), en cours (bleu), à venir (gris).
const PART_STYLE = {
  done: "bg-[#DDEFE3] text-[#1F5C3A]",
  current: "bg-sky text-sky-ink",
  upcoming: "bg-[#EEEAE4] text-[#57524B]",
} as const;

function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// Date au format des champs datetime-local (heure locale) à partir d'un ISO.
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Module « Tournage » : préparer le jour J, le suivre en direct (chrono, parties du script, repères),
// puis passer au Montage.
export function TournageClient({
  episodeId,
  serverNowMs,
  shootAt,
  shootMode,
  shootPlace,
  startedAtMs,
  endedAtMs,
  initialPartIndex,
  initialDone,
  markers: initialMarkers,
  guests: initialGuests,
  parts,
}: {
  episodeId: string;
  serverNowMs: number;
  shootAt: string | null;
  shootMode: string | null;
  shootPlace: string | null;
  startedAtMs: number | null;
  endedAtMs: number | null;
  initialPartIndex: number;
  initialDone: boolean;
  markers: Marker[];
  guests: Guest[];
  parts: Part[];
}) {
  const router = useRouter();
  const live = startedAtMs !== null && endedAtMs === null;
  const ended = startedAtMs !== null && endedAtMs !== null;

  const [when, setWhen] = useState(toLocalInput(shootAt));
  const [mode, setMode] = useState(shootMode);
  const [place, setPlace] = useState(shootPlace ?? "");
  const [guests, setGuests] = useState(initialGuests);
  const [markers, setMarkers] = useState(initialMarkers);
  const [partIndex, setPartIndex] = useState(Math.min(initialPartIndex, Math.max(0, parts.length - 1)));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(initialDone);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(live);
  const [now, setNow] = useState(serverNowMs);
  const containerRef = useRef<HTMLDivElement>(null);

  // Chrono : calé sur l'horloge du serveur (décalage mesuré une fois au chargement de la page).
  useEffect(() => {
    if (!live) return;
    const skew = serverNowMs - Date.now();
    const t = setInterval(() => setNow(Date.now() + skew), 250);
    return () => clearInterval(t);
  }, [live, serverNowMs]);

  const elapsedMs = startedAtMs === null ? 0 : (live ? now : endedAtMs!) - startedAtMs;

  async function call(url: string, init: RequestInit): Promise<Response | null> {
    setError(null);
    try {
      const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "Action impossible.");
      return res;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }

  async function saveShoot(patch: Record<string, unknown>) {
    await call(`/api/episodes/${episodeId}/shoot`, { method: "PATCH", body: JSON.stringify(patch) });
  }

  // « Tournage terminé » : coche le module (tick dans le menu), que le jour J ait été lancé ou non.
  async function setShootDone(next: boolean) {
    setDone(next);
    const res = await call(`/api/episodes/${episodeId}/shoot`, { method: "PATCH", body: JSON.stringify({ shootDone: next }) });
    if (!res) {
      setDone(!next);
      return;
    }
    window.dispatchEvent(new Event(EPISODE_UPDATED_EVENT));
    router.refresh();
  }

  async function toggleNotified(guest: Guest) {
    const next = !guest.notified;
    setGuests((g) => g.map((x) => (x.id === guest.id ? { ...x, notified: next } : x)));
    const res = await call(`/api/episodes/${episodeId}/guests/${guest.id}`, { method: "PATCH", body: JSON.stringify({ notified: next }) });
    if (!res) setGuests((g) => g.map((x) => (x.id === guest.id ? { ...x, notified: !next } : x)));
  }

  async function shootAction(action: "start" | "end" | "restart") {
    setBusy(true);
    const res = await call(`/api/episodes/${episodeId}/shoot`, { method: "POST", body: JSON.stringify({ action }) });
    setBusy(false);
    setConfirmEnd(false);
    setConfirmRestart(false);
    if (!res) return;
    setDone(action === "end");
    if (action !== "end") {
      setMarkers([]);
      setPartIndex(0);
      setFullscreen(true);
      containerRef.current?.requestFullscreen?.().catch(() => {});
    } else if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    window.dispatchEvent(new Event(EPISODE_UPDATED_EVENT));
    router.refresh();
  }

  async function addMarker() {
    const res = await call(`/api/episodes/${episodeId}/shoot/markers`, { method: "POST" });
    if (!res) return;
    const marker = (await res.json()) as Marker;
    setMarkers((m) => [...m, marker]);
  }

  async function removeMarker(id: string) {
    setMarkers((m) => m.filter((x) => x.id !== id));
    await call(`/api/episodes/${episodeId}/shoot/markers/${id}`, { method: "DELETE" });
  }

  function goToPart(index: number) {
    if (index < 0 || index >= parts.length) return;
    setPartIndex(index);
    saveShoot({ shootPartIndex: index });
  }

  const mono = "tabular-nums";
  const placeLabel = MODES.find((m) => m.key === mode)?.placeLabel ?? "Lieu";

  const doneButton = (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => !done && setShootDone(true)}
        className={`text-sm font-semibold rounded-[10px] px-4 py-2 transition ${
          done ? "bg-accent-teal text-white cursor-default" : "bg-primary-button text-white hover:brightness-110"
        }`}
      >
        {done ? "✓ Tournage terminé" : "Tournage terminé"}
      </button>
      {done && (
        <button type="button" onClick={() => setShootDone(false)} className="text-xs text-text-muted underline">
          Retirer la validation
        </button>
      )}
    </div>
  );

  // ---------- Jour J ----------
  if (live) {
    const current = parts[partIndex];
    return (
      <div
        ref={containerRef}
        className={fullscreen ? "fixed inset-0 z-50 overflow-y-auto bg-white" : "rounded-xl border border-border bg-white"}
      >
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-white px-5 py-3">
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#8A2E1F]">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#C0392B]" aria-hidden="true" />
              Enregistrement
            </span>
            <span className={`text-3xl font-bold text-ink ${mono}`}>{formatClock(elapsedMs)}</span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={addMarker} className={`${primaryBtn} px-6 py-3 text-base`}>
              Repère
            </button>
            {confirmEnd ? (
              <>
                <span className="text-xs text-text-muted">Terminer le tournage ?</span>
                <button type="button" onClick={() => shootAction("end")} disabled={busy} className={pillBtn}>
                  Terminer
                </button>
                <button type="button" onClick={() => setConfirmEnd(false)} className={pillBtn}>
                  Annuler
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => setConfirmEnd(true)} className={pillBtn}>
                  Fin du tournage
                </button>
                <button type="button" onClick={() => setFullscreen((v) => !v)} className={pillBtn}>
                  {fullscreen ? "Réduire" : "Plein écran"}
                </button>
              </>
            )}
          </div>
        </div>

        {error && <p className="px-5 pt-3 text-sm text-[#8A2E1F]">{error}</p>}

        {parts.length > 0 && (
          <div className="flex flex-wrap gap-2 px-5 pt-4" role="list" aria-label="Parties du script">
            {parts.map((p, i) => {
              const state = i < partIndex ? "done" : i === partIndex ? "current" : "upcoming";
              return (
                <button
                  key={i}
                  type="button"
                  role="listitem"
                  onClick={() => goToPart(i)}
                  className={`max-w-[220px] truncate rounded-pill px-3.5 py-1.5 text-sm font-semibold transition hover:brightness-95 ${PART_STYLE[state]}`}
                  title={p.title}
                >
                  {i + 1}. {p.title}
                </button>
              );
            })}
          </div>
        )}

        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-5 py-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div>
            {current ? (
              <>
                <div
                  className="text-[28px] leading-relaxed text-ink [&_h1]:mb-3 [&_h1]:text-[1.4em] [&_h1]:font-bold [&_h2]:mb-3 [&_h2]:text-[1.25em] [&_h2]:font-bold [&_p]:my-3 [&_strong]:font-bold [&_em]:italic [&_u]:underline [&_ul]:list-disc [&_ul]:pl-8 [&_ol]:list-decimal [&_ol]:pl-8"
                  dangerouslySetInnerHTML={{ __html: current.html }}
                />
                <div className="mt-6 flex items-center gap-3">
                  <button type="button" onClick={() => goToPart(partIndex - 1)} disabled={partIndex === 0} className={pillBtn}>
                    Partie précédente
                  </button>
                  <button type="button" onClick={() => goToPart(partIndex + 1)} disabled={partIndex >= parts.length - 1} className={primaryBtn}>
                    Partie suivante
                  </button>
                </div>
              </>
            ) : (
              <p className="text-sm text-text-muted">
                Pas de script pour cet épisode. Écris-le dans le module Script : ses titres deviennent les parties du tournage.
              </p>
            )}
          </div>

          <aside className="space-y-3 rounded-xl bg-[#FAFAF8] p-4">
            <h2 className="text-sm font-semibold text-ink">Repères ({markers.length})</h2>
            {markers.length === 0 ? (
              <p className="text-sm text-text-muted">Appuie sur « Repère » pour marquer un moment à retrouver au montage.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {[...markers].reverse().map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2">
                    <span className={`font-semibold text-ink ${mono}`}>{formatClock(m.atMs)}</span>
                    <button type="button" onClick={() => removeMarker(m.id)} className="text-xs text-text-muted underline">
                      Retirer
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      </div>
    );
  }

  // ---------- Tournage terminé ----------
  if (ended) {
    return (
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-lg font-bold text-ink">Tournage</h1>
          {doneButton}
        </div>
        {error && <p className="text-sm text-[#8A2E1F]">{error}</p>}
        <section className="space-y-4 rounded-xl border border-border bg-white p-5">
          <h2 className="text-sm font-semibold text-ink">Tournage terminé</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-md bg-[#FAFAF8] p-3">
              <p className="text-xs text-text-muted">Durée</p>
              <p className={`text-xl font-bold text-ink ${mono}`}>{formatClock(elapsedMs)}</p>
            </div>
            <div className="rounded-md bg-[#FAFAF8] p-3">
              <p className="text-xs text-text-muted">Repères</p>
              <p className="text-xl font-bold text-ink">{markers.length}</p>
            </div>
            <div className="rounded-md bg-[#FAFAF8] p-3">
              <p className="text-xs text-text-muted">Invités</p>
              <p className="text-xl font-bold text-ink">{guests.length}</p>
            </div>
          </div>
          {markers.length > 0 && (
            <p className="text-sm text-text-muted">
              Repères : {markers.map((m) => formatClock(m.atMs)).join(", ")}. Ils sont ajoutés aux consignes envoyées à un monteur, et Claude peut les lire.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Link href={`/episodes/${episodeId}/montage`} className={primaryBtn}>
              Importer mes rushs
            </Link>
            {confirmRestart ? (
              <>
                <span className="text-xs text-text-muted">Les repères actuels seront effacés.</span>
                <button type="button" onClick={() => shootAction("restart")} disabled={busy} className={pillBtn}>
                  Refaire un tournage
                </button>
                <button type="button" onClick={() => setConfirmRestart(false)} className={pillBtn}>
                  Annuler
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmRestart(true)} className={pillBtn}>
                Refaire un tournage
              </button>
            )}
          </div>
        </section>
      </div>
    );
  }

  // ---------- Préparer ----------
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-lg font-bold text-ink">Tournage</h1>
        {doneButton}
      </div>
      {error && <p className="text-sm text-[#8A2E1F]">{error}</p>}

      <section className="space-y-3 rounded-xl border border-border bg-white p-5">
        <h2 className="text-sm font-semibold text-ink">Quand et où</h2>
        <input
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          onBlur={() => saveShoot({ shootAt: when ? new Date(when).toISOString() : null })}
          className={`${inputClass} max-w-xs`}
        />
        <div className="flex flex-wrap gap-2">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              aria-pressed={mode === m.key}
              onClick={() => {
                setMode(m.key);
                saveShoot({ shootMode: m.key });
              }}
              className={`rounded-pill border px-3.5 py-1.5 text-sm font-semibold transition ${
                mode === m.key ? "border-primary-button bg-peach/40 text-ink" : "border-border bg-white text-text-muted hover:bg-[#FAFAF8]"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        {mode && (
          <div>
            <label className="mb-1 block text-xs font-medium text-text-muted">{placeLabel}</label>
            {mode === "REMOTE" ? (
              <input type="text" value={place} onChange={(e) => setPlace(e.target.value)} onBlur={() => saveShoot({ shootPlace: place.trim() || null })} className={inputClass} />
            ) : (
              <AddressInput value={place} onChange={setPlace} onCommit={(v) => saveShoot({ shootPlace: v.trim() || null })} />
            )}
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-white p-5">
        <h2 className="text-sm font-semibold text-ink">Invités</h2>
        {guests.length === 0 ? (
          <p className="text-sm text-text-muted">
            Aucun invité sur cet épisode.{" "}
            <Link href={`/episodes/${episodeId}/guests`} className="underline">
              Composer le casting
            </Link>
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border text-sm">
            {guests.map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0 truncate text-ink">
                  {g.name}
                  {g.media && <span className="text-text-muted"> - {g.media}</span>}
                </span>
                <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-text-muted">
                  <input type="checkbox" checked={g.notified} onChange={() => toggleNotified(g)} />
                  Prévenu
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="space-y-1">
        <button type="button" onClick={() => shootAction("start")} disabled={busy} className={primaryBtn}>
          {busy ? "..." : "Lancer le jour J"}
        </button>
        <p className="text-xs text-text-muted">Le chrono démarre : lance ton enregistrement en même temps pour que les repères tombent juste.</p>
      </div>
    </div>
  );
}
