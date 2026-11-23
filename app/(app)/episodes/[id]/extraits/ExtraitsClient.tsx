"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CLIP_PRICE_LABEL, CLIP_STATUSES } from "./constants";
import { formatShootTime } from "@/lib/shootMarkers";

interface Word {
  text: string;
  startMs: number;
  endMs: number;
}
interface Segment {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  words: Word[] | null;
}
interface ClipItem {
  id: string;
  title: string;
  startMs: number;
  endMs: number;
  excerpt: string;
  status: string;
  source: string;
  editor: string | null;
  fileName: string | null;
  fileUrl: string | null;
  publishedUrl: string | null;
}
interface Token {
  seg: number;
  text: string;
  startMs: number;
  endMs: number;
}

const pillBtn =
  "text-xs font-semibold rounded-pill bg-white border border-border px-3 py-1.5 hover:bg-[#FAFAF8] transition disabled:opacity-50 disabled:cursor-not-allowed";
const primaryBtn =
  "text-sm font-semibold rounded-[10px] bg-primary-button text-white px-4 py-2 hover:brightness-110 transition disabled:opacity-50 disabled:cursor-not-allowed";
const inputClass = "w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-button/30";

const normalize = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Module « Extraits » : tableau par statut, création d'un extrait en sélectionnant dans le transcript, fiche d'un extrait.
export function ExtraitsClient({
  episodeId,
  paymentReturn,
  ownEditorEmail,
  clips,
  transcript,
  markers,
}: {
  episodeId: string;
  paymentReturn: string | null;
  ownEditorEmail: string | null;
  clips: ClipItem[];
  transcript: Segment[];
  markers: number[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirmedPayment = useRef(false);
  const openClip = clips.find((c) => c.id === openId) ?? null;

  // Retour de Stripe Checkout (montage d'un extrait par un monteur naocast).
  useEffect(() => {
    if (!paymentReturn || confirmedPayment.current) return;
    confirmedPayment.current = true;
    fetch(`/api/episodes/${episodeId}/clips/confirm?session_id=${encodeURIComponent(paymentReturn)}`)
      .catch(() => {})
      .finally(() => {
        router.replace(`/episodes/${episodeId}/extraits`);
        router.refresh();
      });
  }, [paymentReturn, episodeId, router]);

  if (creating) {
    return (
      <NewClip
        episodeId={episodeId}
        transcript={transcript}
        markers={markers}
        onCancel={() => setCreating(false)}
        onCreated={() => {
          setCreating(false);
          router.refresh();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-ink">Extraits</h1>
        <button type="button" onClick={() => setCreating(true)} className={primaryBtn}>
          + Nouvel extrait
        </button>
      </div>
      {error && <p className="text-sm text-[#8A2E1F]">{error}</p>}
      {transcript.length === 0 && (
        <p className="rounded-md bg-peach p-3 text-sm text-peach-ink">
          Pour créer un extrait, il faut d&apos;abord un transcript.{" "}
          <Link href={`/episodes/${episodeId}/transcript`} className="underline">
            Générer le transcript
          </Link>
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {CLIP_STATUSES.map((col) => {
          const items = clips.filter((c) => c.status === col.key);
          return (
            <section key={col.key} className="space-y-2 rounded-xl bg-[#FAFAF8] p-3">
              <h2 className="flex items-center justify-between px-1 text-sm font-semibold text-ink">
                {col.label}
                <span className="text-xs font-medium text-text-muted">{items.length}</span>
              </h2>
              {items.length === 0 ? (
                <p className="px-1 py-3 text-center text-xs text-text-muted">Aucun extrait</p>
              ) : (
                items.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setOpenId(c.id)}
                    className="block w-full rounded-lg border border-border bg-white p-3 text-left text-sm transition hover:bg-[#FAFAF8]"
                  >
                    <p className="font-semibold text-ink">{c.title}</p>
                    <p className="mt-0.5 text-xs text-text-muted">
                      {formatShootTime(c.startMs)} à {formatShootTime(c.endMs)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                      {c.source === "CLAUDE" && <span className="rounded-pill bg-sky px-2 py-0.5 text-sky-ink">Proposé par Claude</span>}
                      {c.editor === "OWN" && <span className="rounded-pill bg-butter px-2 py-0.5 text-butter-ink">Chez mon monteur</span>}
                      {c.editor === "NAOCAST" && <span className="rounded-pill bg-butter px-2 py-0.5 text-butter-ink">Monteur naocast</span>}
                      {c.fileUrl && <span className="rounded-pill bg-[#DDEFE3] px-2 py-0.5 text-[#1F5C3A]">Vidéo déposée</span>}
                      {c.publishedUrl && <span className="rounded-pill bg-[#DDEFE3] px-2 py-0.5 text-[#1F5C3A]">Publié</span>}
                    </div>
                  </button>
                ))
              )}
            </section>
          );
        })}
      </div>

      {openClip && (
        <ClipDetail
          key={openClip.id}
          episodeId={episodeId}
          clip={openClip}
          ownEditorEmail={ownEditorEmail}
          onClose={() => setOpenId(null)}
          onError={setError}
        />
      )}
    </div>
  );
}

// ---------- Création : sélection dans le transcript ----------

function NewClip({
  episodeId,
  transcript,
  markers,
  onCancel,
  onCreated,
}: {
  episodeId: string;
  transcript: Segment[];
  markers: number[];
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [from, setFrom] = useState<number | null>(null);
  const [to, setTo] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [matchIndex, setMatchIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Phrases à plat (une phrase = un jeton cliquable) : on coupe chaque passage du transcript à la ponctuation
  // de fin de phrase. Avec les mots horodatés, les bornes sont exactes ; sinon elles sont estimées au prorata.
  const tokens = useMemo<Token[]>(() => {
    const END = /[.!?…]["'»”)\]]*$/;
    return transcript.flatMap((s, seg) => {
      const out: Token[] = [];
      if (s.words && s.words.length > 0) {
        let buf: typeof s.words = [];
        for (const w of s.words) {
          buf.push(w);
          if (END.test(w.text.trim())) {
            out.push({ seg, text: buf.map((b) => b.text).join(" "), startMs: buf[0].startMs, endMs: w.endMs });
            buf = [];
          }
        }
        if (buf.length) out.push({ seg, text: buf.map((b) => b.text).join(" "), startMs: buf[0].startMs, endMs: buf[buf.length - 1].endMs });
      } else {
        const parts = s.text.split(/(?<=[.!?…])\s+/).filter(Boolean);
        const total = parts.reduce((n, t) => n + t.length, 0) || 1;
        let cursor = s.startMs;
        for (const part of parts) {
          const end = cursor + Math.round(((s.endMs - s.startMs) * part.length) / total);
          out.push({ seg, text: part, startMs: cursor, endMs: end });
          cursor = end;
        }
      }
      return out.length ? out : [{ seg, text: s.text, startMs: s.startMs, endMs: s.endMs }];
    });
  }, [transcript]);
  const firstTokenOfSegment = useMemo(() => {
    const map = new Map<number, number>();
    tokens.forEach((t, i) => {
      if (!map.has(t.seg)) map.set(t.seg, i);
    });
    return map;
  }, [tokens]);

  const matches = useMemo(() => {
    const q = normalize(query.trim());
    if (q.length < 2) return [] as number[];
    return transcript.map((s, i) => (normalize(s.text).includes(q) ? i : -1)).filter((i) => i >= 0);
  }, [query, transcript]);

  const markerSegments = useMemo(() => {
    const map = new Map<number, number[]>();
    for (const atMs of markers) {
      const idx = transcript.findIndex((s) => atMs >= s.startMs && atMs <= s.endMs);
      const seg = idx >= 0 ? idx : transcript.findIndex((s) => s.startMs >= atMs);
      if (seg >= 0) map.set(seg, [...(map.get(seg) ?? []), atMs]);
    }
    return map;
  }, [markers, transcript]);

  const segmentRefs = useRef<Map<number, HTMLElement>>(new Map());
  function scrollToSegment(seg: number) {
    segmentRefs.current.get(seg)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function pickToken(i: number) {
    if (from === null || (from !== null && to !== null)) {
      setFrom(i);
      setTo(null);
    } else {
      setTo(i);
    }
  }

  const lo = from !== null ? Math.min(from, to ?? from) : null;
  const hi = from !== null ? Math.max(from, to ?? from) : null;
  const selected = lo !== null && hi !== null ? tokens.slice(lo, hi + 1) : [];
  const startMs = selected.length ? selected[0].startMs : null;
  const endMs = selected.length ? selected[selected.length - 1].endMs : null;
  const excerpt = selected.map((t) => t.text).join(" ");

  async function submit() {
    if (startMs === null || endMs === null || !title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/episodes/${episodeId}/clips`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), startMs, endMs, excerpt }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "Création impossible.");
      onCreated();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  function gotoMatch(next: number) {
    if (matches.length === 0) return;
    const i = (next + matches.length) % matches.length;
    setMatchIndex(i);
    scrollToSegment(matches[i]);
  }

  const q = normalize(query.trim());

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-ink">Nouvel extrait</h1>
        <button type="button" onClick={onCancel} className={pillBtn}>
          Annuler
        </button>
      </div>
      <p className="text-sm text-text-muted">Clique sur la première phrase du passage, puis sur la dernière. Un troisième clic recommence.</p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-3 rounded-xl border border-border bg-white p-4">
          <div className="flex items-center gap-2">
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setMatchIndex(0);
              }}
              onKeyDown={(e) => e.key === "Enter" && gotoMatch(matchIndex + (e.shiftKey ? -1 : 1))}
              placeholder="Rechercher un mot dans le transcript"
              className={inputClass}
            />
            {q.length >= 2 && (
              <>
                <span className="shrink-0 text-xs text-text-muted">{matches.length === 0 ? "Aucun résultat" : `${matchIndex + 1} sur ${matches.length}`}</span>
                <button type="button" onClick={() => gotoMatch(matchIndex - 1)} disabled={matches.length === 0} className={pillBtn} aria-label="Résultat précédent">
                  Préc.
                </button>
                <button type="button" onClick={() => gotoMatch(matchIndex + 1)} disabled={matches.length === 0} className={pillBtn} aria-label="Résultat suivant">
                  Suiv.
                </button>
              </>
            )}
          </div>

          {transcript.length === 0 ? (
            <p className="text-sm text-text-muted">Aucun transcript pour cet épisode.</p>
          ) : (
            <div className="max-h-[32rem] space-y-3 overflow-y-auto pr-1 text-[15px] leading-relaxed">
              {transcript.map((s, segIdx) => {
                const isMatch = q.length >= 2 && matches.includes(segIdx);
                const startToken = firstTokenOfSegment.get(segIdx) ?? 0;
                const segTokens = tokens.slice(startToken).filter((t) => t.seg === segIdx);
                return (
                  <div
                    key={s.id}
                    ref={(el) => {
                      if (el) segmentRefs.current.set(segIdx, el);
                    }}
                    className={`rounded-md p-1.5 ${isMatch ? "bg-butter" : ""}`}
                  >
                    <span className="mr-2 text-xs text-text-muted">{formatShootTime(s.startMs)}</span>
                    {segTokens.map((t, k) => {
                      const i = startToken + k;
                      const inRange = lo !== null && hi !== null && i >= lo && i <= hi;
                      return (
                        <span key={i}>
                          <button
                            type="button"
                            onClick={() => pickToken(i)}
                            className={`rounded px-0.5 text-left transition ${inRange ? "bg-sky text-sky-ink" : "hover:bg-[#F0EEEA]"}`}
                          >
                            {t.text}
                          </button>{" "}
                        </span>
                      );
                    })}
                    {markerSegments.has(segIdx) && (
                      <span className="ml-1 inline-flex items-center gap-1 rounded-pill bg-butter px-2 py-0.5 text-xs text-butter-ink" title="Repère posé au tournage après le moment vécu : le passage se termine ici ou juste avant.">
                        Repère {markerSegments.get(segIdx)!.map((m) => formatShootTime(m)).join(", ")}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-xl border border-border bg-white p-4">
          <h2 className="text-sm font-semibold text-ink">Passage choisi</h2>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md bg-[#FAFAF8] p-2.5">
              <p className="text-xs text-text-muted">Début</p>
              <p className="text-base font-bold text-ink">{startMs === null ? "-" : formatShootTime(startMs)}</p>
            </div>
            <div className="rounded-md bg-[#FAFAF8] p-2.5">
              <p className="text-xs text-text-muted">Fin</p>
              <p className="text-base font-bold text-ink">{endMs === null ? "-" : formatShootTime(endMs)}</p>
            </div>
          </div>
          {excerpt && <p className="max-h-32 overflow-y-auto rounded-md bg-[#FAFAF8] p-2.5 text-sm text-text-muted">{excerpt}</p>}
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre de l'extrait" maxLength={200} className={inputClass} />
          {error && <p className="text-sm text-[#8A2E1F]">{error}</p>}
          <button type="button" onClick={submit} disabled={busy || startMs === null || !title.trim()} className={`${primaryBtn} w-full`}>
            {busy ? "..." : "Ajouter aux extraits"}
          </button>
          {markers.length > 0 && (
            <div className="space-y-1.5 border-t border-border pt-3">
              <p className="text-xs font-medium text-text-muted">Repères du tournage</p>
              <div className="flex flex-wrap gap-1.5">
                {markers.map((m, i) => {
                  const seg = [...markerSegments.entries()].find(([, list]) => list.includes(m))?.[0];
                  return (
                    <button key={i} type="button" disabled={seg === undefined} onClick={() => seg !== undefined && scrollToSegment(seg)} className={pillBtn}>
                      {formatShootTime(m)}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-text-muted">Posé après le moment vécu : le passage finit à peu près là. Un repère n&apos;est qu&apos;une piste, il peut aussi marquer un passage à couper.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Fiche d'un extrait ----------

function ClipDetail({
  episodeId,
  clip,
  ownEditorEmail,
  onClose,
  onError,
}: {
  episodeId: string;
  clip: ClipItem;
  ownEditorEmail: string | null;
  onClose: () => void;
  onError: (message: string | null) => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(clip.title);
  const [notes, setNotes] = useState("");
  const [email, setEmail] = useState(ownEditorEmail ?? "");
  const [link, setLink] = useState(clip.publishedUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const base = `/api/episodes/${episodeId}/clips/${clip.id}`;

  async function call(url: string, init: RequestInit, success?: string): Promise<Response | null> {
    setBusy(true);
    setMessage(null);
    onError(null);
    try {
      const res = await fetch(url, init);
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "Action impossible.");
      if (success) setMessage(success);
      router.refresh();
      return res;
    } catch (e) {
      setMessage((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  const patch = (body: Record<string, unknown>, success?: string) =>
    call(base, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, success);

  async function sendNaocast() {
    const res = await call(`${base}/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "naocast", notes }) });
    if (!res) return;
    const data = (await res.json()) as { url?: string };
    if (data.url) window.location.href = data.url;
  }

  async function uploadFile(file: File | undefined) {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    await call(`${base}/file`, { method: "POST", body: form }, "Vidéo déposée.");
  }

  async function remove() {
    const res = await call(base, { method: "DELETE" });
    if (res) onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4" onClick={onClose}>
      <div className="my-8 w-full max-w-2xl space-y-5 rounded-xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title.trim() !== clip.title && patch({ title: title.trim() })}
            className="w-full rounded-md border border-transparent px-2 py-1 text-lg font-bold text-ink hover:border-border focus:border-border focus:outline-none"
            aria-label="Titre de l'extrait"
          />
          <button type="button" onClick={onClose} className={pillBtn}>
            Fermer
          </button>
        </div>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-ink">Brief de montage</h3>
          <div className="rounded-md bg-[#FAFAF8] p-3 text-sm">
            <p className="text-text-muted">
              Passage : <span className="font-semibold text-ink">{formatShootTime(clip.startMs)} à {formatShootTime(clip.endMs)}</span>
            </p>
            <p className="mt-2 whitespace-pre-wrap text-text-muted">{clip.excerpt}</p>
          </div>
          <label className="block text-sm font-medium text-ink">Tes consignes pour le monteur</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={5000} placeholder="Le ton, l'accroche, ce qu'il faut garder..." className={inputClass} />
          <div className="flex flex-wrap items-center gap-2">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email de ton monteur" className={`${inputClass} max-w-xs`} />
            <button
              type="button"
              disabled={busy || !email.trim()}
              onClick={() => call(`${base}/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "own", email, notes }) }, "Brief envoyé à ton monteur.")}
              className={pillBtn}
            >
              Envoyer à mon monteur
            </button>
          </div>
          <button type="button" onClick={sendNaocast} disabled={busy} className={pillBtn}>
            Envoyer à un monteur naocast - {CLIP_PRICE_LABEL}
          </button>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-ink">Short monté (facultatif)</h3>
          {clip.fileUrl ? (
            <div className="space-y-2">
              <video src={clip.fileUrl} controls className="max-h-72 rounded-md border border-border bg-black" />
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-text-muted">{clip.fileName}</span>
                <a href={clip.fileUrl} download={clip.fileName ?? undefined} className={pillBtn}>
                  Télécharger
                </a>
                <button type="button" onClick={() => call(`${base}/file`, { method: "DELETE" })} disabled={busy} className={pillBtn}>
                  Retirer
                </button>
              </div>
            </div>
          ) : (
            <label className={`${pillBtn} inline-block cursor-pointer`}>
              {busy ? "..." : "Déposer le short monté"}
              <input type="file" accept="video/*" className="hidden" disabled={busy} onChange={(e) => { uploadFile(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-ink">Publication</h3>
          <div className="flex flex-wrap items-center gap-2">
            <input type="text" value={link} onChange={(e) => setLink(e.target.value)} placeholder="Lien du short publié sur YouTube" className={`${inputClass} max-w-md`} />
            <button type="button" onClick={() => patch({ publishedUrl: link }, link.trim() ? "Short relié à l'épisode." : "Lien retiré.")} disabled={busy || link.trim() === (clip.publishedUrl ?? "")} className={pillBtn}>
              Enregistrer le lien
            </button>
          </div>
          <p className="text-xs text-text-muted">Le short devient un contenu annexe de l&apos;épisode : ses vues apparaissent dans Diffusion.</p>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <label className="flex items-center gap-2 text-sm text-text-muted">
            Statut
            <select
              value={clip.status}
              onChange={(e) => patch({ status: e.target.value })}
              disabled={busy}
              className="rounded-md border border-border bg-white px-2 py-1 text-sm text-ink"
            >
              {CLIP_STATUSES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          {confirmDelete ? (
            <span className="flex items-center gap-2 text-xs">
              <span className="text-text-muted">Supprimer cet extrait ?</span>
              <button type="button" onClick={remove} disabled={busy} className={`${pillBtn} text-[#8A2E1F]`}>
                Supprimer
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} className={pillBtn}>
                Annuler
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className="text-xs text-text-muted underline">
              Supprimer l&apos;extrait
            </button>
          )}
        </div>
        {message && <p className="text-sm text-text-muted">{message}</p>}
      </div>
    </div>
  );
}
