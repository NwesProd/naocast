"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/Button";
import { EPISODE_UPDATED_EVENT } from "@/components/SidebarNav";
import { useSimulatedProgress } from "@/lib/useSimulatedProgress";

interface TranscriptWord {
  text: string;
  startMs: number;
  endMs: number;
}

interface TranscriptSentence {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  words: TranscriptWord[] | null;
}

interface RemovedRange {
  startMs: number;
  endMs: number;
}

interface IntroSegment {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  removedRanges: RemovedRange[];
}

const pillBtn =
  "text-xs font-semibold rounded-pill bg-white border border-border px-3 py-1.5 hover:bg-[#FAFAF8] transition disabled:opacity-50 disabled:cursor-not-allowed";
const secondaryBtn = "text-sm rounded-[10px] bg-white border border-border text-ink px-3 py-1.5 hover:bg-[#FAFAF8] transition";

function formatTime(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Recouvrement (pas une égalité stricte) : un glisser-sélectionner peut créer
// UN SEUL removedRange couvrant plusieurs mots contigus (cf. le mode "Cut" plus
// bas), dont les mots intermédiaires n'ont pas individuellement les mêmes
// bornes que la plage entière, seul un containment les détecte tous comme
// retirés. Sûr désormais car flatWords ne mélange plus jamais un vrai mot avec
// un "bloc" de repli couvrant toute une phrase sans horodatage mot par mot (la
// cause du grisage involontaire observé avant) : chaque removedRange ne
// provient que de vrais mots contigus d'un seul passage.
function isWordRemoved(word: TranscriptWord, removedRanges: RemovedRange[]): boolean {
  return removedRanges.some((r) => word.startMs >= r.startMs && word.endMs <= r.endMs);
}

// Module "Intro" (étape 7 du tunnel, à part) : sélectionner des passages du
// transcript à garder (pas à retirer, contrairement à l'étape "Cut") et les
// réordonner librement (glisser-déposer) pour construire un teaser diffusé
// avant le générique de début. Une fois validé, l'écran bascule sur un état
// "figé" (téléchargement + recommencer à zéro) plutôt que de continuer à
// montrer l'éditeur, même logique que la relecture une fois l'épisode exporté.
export function IntroClient({
  episodeId,
  transcript,
  initialIntroSegments,
  initialTeaserUrl,
  initialValidated,
  episodeLabel,
}: {
  episodeId: string;
  transcript: TranscriptSentence[];
  initialIntroSegments: IntroSegment[];
  initialTeaserUrl: string | null;
  initialValidated: boolean;
  episodeLabel: string;
}) {
  const [introSegments, setIntroSegments] = useState<IntroSegment[]>(initialIntroSegments);
  const [teaserUrl, setTeaserUrl] = useState<string | null>(initialTeaserUrl);
  const [building, setBuilding] = useState(false);
  // buildProgress : dernière valeur RÉELLE reçue du serveur (par paliers, au
  // rythme des rapports ffmpeg). displayedBuildProgress : valeur affichée,
  // animée en douceur vers cette cible plutôt que de sauter d'un palier à
  // l'autre, donne un vrai "% par %" à l'écran au lieu de bonds de 20-30%.
  const [buildProgress, setBuildProgress] = useState(0);
  const [displayedBuildProgress, setDisplayedBuildProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [validated, setValidated] = useState(initialValidated);
  const [validating, setValidating] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [cutModeSegmentId, setCutModeSegmentId] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const suggestProgress = useSimulatedProgress(suggesting);
  const [dragWordAnchor, setDragWordAnchor] = useState<number | null>(null);
  const [dragWordEnd, setDragWordEnd] = useState<number | null>(null);

  // Glisser-sélectionner plusieurs mots d'affilée (mode "Cut") : mêmes refs et
  // même garde-fou anti-tremblement que l'éditeur de l'étape "Cut" principale
  // (cf. components/TranscriptCutEditor.tsx), sans le seuil, un simple clic
  // pouvait déclencher un début de glisser vers le mot voisin.
  const isDraggingWordsRef = useRef(false);
  const dragWordStateRef = useRef<{ anchor: number | null; end: number | null }>({ anchor: null, end: null });
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null);
  const cutModeContextRef = useRef<{ segment: IntroSegment; words: TranscriptWord[] } | null>(null);
  const DRAG_THRESHOLD_PX = 6;

  const addedIds = new Set(
    introSegments.map((s) => transcript.find((t) => t.startMs === s.startMs && t.endMs === s.endMs)?.id).filter(Boolean)
  );

  // Tous les mots horodatés de l'épisode, à plat, sert à retrouver les mots
  // d'un passage par recouvrement temporel (cf. mode "Cut" plus bas) plutôt
  // que par correspondance exacte de phrase, qui échoue pour un passage
  // suggéré par l'IA (souvent une sous-partie d'une phrase).
  //
  // Les phrases SANS horodatage mot par mot sont volontairement exclues d'ici
  // (pas de repli "un seul bloc" mélangé aux vrais mots) : un repli aurait
  // représenté toute une phrase comme un unique "mot" géant, qui pouvait se
  // retrouver mêlé aux mots individuels d'une phrase voisine dans le même
  // passage, un clic sur un mot proche de cette frontière marquait alors
  // tout le bloc de repli d'un coup (la phrase apparaissait à moitié "grisée"
  // dès le premier mot cliqué dans cette zone, constaté en conditions
  // réelles). Un passage qui tombe entièrement dans une phrase sans mots
  // retombe proprement sur le repli "bloc entier" plus bas, sans ce mélange.
  const flatWords: TranscriptWord[] = transcript.flatMap((s) => (s.words && s.words.length > 0 ? s.words : []));

  async function addSegment(sentence: TranscriptSentence) {
    setError(null);
    const res = await fetch(`/api/episodes/${episodeId}/intro-segments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startMs: sentence.startMs, endMs: sentence.endMs, text: sentence.text }),
    });
    if (!res.ok) {
      setError("Échec de l'ajout du passage.");
      return;
    }
    const created = await res.json();
    setIntroSegments((s) => [...s, { ...created, removedRanges: created.removedRanges ?? [] }]);
  }

  async function suggestHooks() {
    setSuggesting(true);
    setError(null);
    try {
      const res = await fetch(`/api/episodes/${episodeId}/intro-suggestions`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Échec de la suggestion automatique.");
      }
      const created: IntroSegment[] = await res.json();
      if (created.length === 0) {
        setError("Aucun nouveau passage suggéré (déjà tous présents dans la séquence ?).");
        return;
      }
      setIntroSegments((s) => [...s, ...created.map((seg) => ({ ...seg, removedRanges: seg.removedRanges ?? [] }))]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSuggesting(false);
    }
  }

  async function removeSegment(id: string) {
    setIntroSegments((s) => s.filter((seg) => seg.id !== id));
    if (cutModeSegmentId === id) setCutModeSegmentId(null);
    await fetch(`/api/episodes/${episodeId}/intro-segments/${id}`, { method: "DELETE" });
  }

  async function persistOrder(ordered: IntroSegment[]) {
    setIntroSegments(ordered);
    await fetch(`/api/episodes/${episodeId}/intro-segments/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds: ordered.map((s) => s.id) }),
    });
  }

  function handleDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      return;
    }
    const next = [...introSegments];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(targetIndex, 0, moved);
    setDragIndex(null);
    persistOrder(next);
  }

  async function saveRemovedRanges(segmentId: string, nextRanges: RemovedRange[]) {
    setIntroSegments((segs) => segs.map((s) => (s.id === segmentId ? { ...s, removedRanges: nextRanges } : s)));
    await fetch(`/api/episodes/${episodeId}/intro-segments/${segmentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ removedRanges: nextRanges }),
    });
  }

  // Clic sur un mot déjà marqué (barré) : annule tout de suite le retrait,
  // sans passer par un glisser, le range à supprimer peut couvrir plusieurs
  // mots (résultat d'un glisser-sélectionner précédent), pas seulement celui
  // cliqué.
  function removeRangeCovering(segment: IntroSegment, word: TranscriptWord) {
    const nextRanges = segment.removedRanges.filter((r) => !(word.startMs >= r.startMs && word.endMs <= r.endMs));
    saveRemovedRanges(segment.id, nextRanges);
  }

  // Valide une sélection (un seul mot cliqué, ou plusieurs via glisser) : un
  // seul removedRange couvrant du premier au dernier mot sélectionné. Toggle
  // comme ailleurs dans l'appli : si ce range EXACT existe déjà, on l'annule.
  function finalizeWordSelection(segment: IntroSegment, fromWord: TranscriptWord, toWord: TranscriptWord) {
    const startMs = fromWord.startMs;
    const endMs = toWord.endMs;
    const existingIdx = segment.removedRanges.findIndex((r) => r.startMs === startMs && r.endMs === endMs);
    const nextRanges =
      existingIdx !== -1
        ? segment.removedRanges.filter((_, i) => i !== existingIdx)
        : [...segment.removedRanges, { startMs, endMs }];
    saveRemovedRanges(segment.id, nextRanges);
  }

  // Tient cutModeContextRef à jour hors rendu (jamais en le mutant pendant le
  // rendu lui-même, interdit par React) : le segment/mots actifs pour le
  // mode "Cut" en cours, recalculés à chaque changement de sélection ou de
  // removedRanges (ex. après un glisser précédent sur le même passage).
  useEffect(() => {
    if (!cutModeSegmentId) {
      cutModeContextRef.current = null;
      return;
    }
    const segment = introSegments.find((s) => s.id === cutModeSegmentId);
    if (!segment) {
      cutModeContextRef.current = null;
      return;
    }
    const words = flatWords.filter((w) => w.startMs >= segment.startMs && w.endMs <= segment.endMs);
    cutModeContextRef.current = { segment, words: words.length > 0 ? words : [{ text: segment.text, startMs: segment.startMs, endMs: segment.endMs }] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cutModeSegmentId, introSegments]);

  useEffect(() => {
    function handleMouseUp() {
      if (!isDraggingWordsRef.current) return;
      isDraggingWordsRef.current = false;
      mouseDownPosRef.current = null;
      window.getSelection?.()?.removeAllRanges();
      const { anchor, end } = dragWordStateRef.current;
      setDragWordAnchor(null);
      setDragWordEnd(null);
      const ctx = cutModeContextRef.current;
      if (anchor === null || end === null || !ctx) return;
      const from = Math.min(anchor, end);
      const to = Math.max(anchor, end);
      if (ctx.words[from] && ctx.words[to]) finalizeWordSelection(ctx.segment, ctx.words[from], ctx.words[to]);
    }
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [introSegments]);

  // Anime la progression affichée vers la dernière valeur reçue du serveur,
  // un point à la fois, plutôt que de sauter directement d'un palier ffmpeg au
  // suivant (les rapports de ffmpeg arrivent par intervalles de temps, pas un
  // par pourcentage), donne un vrai "% par %" à l'écran.
  useEffect(() => {
    if (!building) return;
    const targetPct = Math.round(buildProgress * 100);
    const interval = setInterval(() => {
      setDisplayedBuildProgress((current) => {
        if (current >= targetPct) {
          clearInterval(interval);
          return current;
        }
        return current + 1;
      });
    }, 30);
    return () => clearInterval(interval);
  }, [buildProgress, building]);

  async function buildTeaser() {
    setBuilding(true);
    setBuildProgress(0);
    setDisplayedBuildProgress(0);
    setError(null);
    try {
      const res = await fetch(`/api/episodes/${episodeId}/intro-teaser`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Échec de la génération de l'intro.");
      }
      if (!res.body) throw new Error("Réponse invalide du serveur.");

      // Réponse en NDJSON (une ligne JSON par évènement, cf. la route) : les
      // lignes de progression peuvent arriver découpées entre deux chunks
      // réseau, d'où le buffer, on ne traite une ligne que lorsqu'elle est
      // entièrement reçue (jusqu'au prochain "\n").
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalUrl: string | null = null;
      let streamError: string | null = null;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const msg = JSON.parse(line) as { progress?: number; done?: boolean; url?: string; error?: string };
          if (typeof msg.progress === "number") setBuildProgress(msg.progress);
          else if (msg.done && msg.url) finalUrl = msg.url;
          else if (msg.error) streamError = msg.error;
        }
      }
      if (streamError) throw new Error(streamError);
      if (!finalUrl) throw new Error("Échec de la génération de l'intro.");
      setTeaserUrl(finalUrl);
      setValidated(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBuilding(false);
    }
  }

  async function validateIntro() {
    setValidating(true);
    setError(null);
    try {
      const res = await fetch(`/api/episodes/${episodeId}/intro-teaser/validate`, { method: "POST" });
      if (!res.ok) throw new Error("Échec de la validation de l'intro.");
      setValidated(true);
      window.dispatchEvent(new Event(EPISODE_UPDATED_EVENT));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setValidating(false);
    }
  }

  async function resetIntro() {
    setResetting(true);
    try {
      await fetch(`/api/episodes/${episodeId}/intro-teaser/reset`, { method: "POST" });
      setIntroSegments([]);
      setTeaserUrl(null);
      setValidated(false);
      setConfirmingReset(false);
      window.dispatchEvent(new Event(EPISODE_UPDATED_EVENT));
    } finally {
      setResetting(false);
    }
  }

  if (validated) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-bold text-ink">Intro</h1>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2 rounded-xl bg-mint p-5">
            <h2 className="font-semibold text-mint-ink mb-3">Intro validée</h2>
            {teaserUrl && <video src={teaserUrl} controls className="w-full rounded-md bg-black" />}
          </div>
          <div className="lg:col-span-1 space-y-4">
            <Link
              href={`/episodes/${episodeId}/montage?step=6`}
              className="block text-sm font-semibold rounded-[10px] bg-primary-button text-white px-4 py-2.5 text-center hover:brightness-110 transition"
            >
              Retourner au montage de l&apos;épisode
            </Link>
            <div className="rounded-xl bg-sky p-5 flex flex-col gap-3">
              {teaserUrl && (
                <a
                  href={teaserUrl}
                  download={`Intro - ${episodeLabel.replace(/[\\/:*?"<>|]/g, " ")}.mp4`}
                  className={`${secondaryBtn} text-center`}
                >
                  Télécharger l&apos;intro
                </a>
              )}
            </div>
            <div className="rounded-xl bg-peach p-5">
              <button onClick={() => setConfirmingReset(true)} className={`${pillBtn} text-[#8A2E1F]`}>
                Recommencer à zéro
              </button>
            </div>
          </div>
        </div>

        {confirmingReset && (
          <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-4" onClick={() => !resetting && setConfirmingReset(false)}>
            <div className="bg-white rounded-xl p-5 max-w-sm w-full space-y-3" onClick={(e) => e.stopPropagation()}>
              <h2 className="font-semibold text-ink">Recommencer l&apos;intro à zéro ?</h2>
              <p className="text-sm text-text-muted">
                Les passages choisis et l&apos;intro construite seront définitivement supprimés.
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setConfirmingReset(false)}
                  disabled={resetting}
                  className="text-sm rounded-[10px] bg-white border border-border text-ink px-3 py-1.5 hover:bg-[#FAFAF8] transition disabled:opacity-50"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={resetIntro}
                  disabled={resetting}
                  className="text-sm font-semibold rounded-[10px] bg-[#8A2E1F] text-white px-3 py-1.5 hover:brightness-110 transition disabled:opacity-50"
                >
                  {resetting ? "Réinitialisation..." : "Recommencer à zéro"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-ink">Intro</h1>
        <p className="text-sm text-text-muted">
          Le teaser diffusé avant le générique de début : choisis des passages à garder, dans l&apos;ordre de ton
          choix.
        </p>
      </div>

      {error && <p className="text-sm text-[#8A2E1F]">{error}</p>}

      {transcript.length === 0 ? (
        <div className="rounded-xl bg-sky p-5">
          <p className="text-sm text-sky-ink">
            Aucun transcript pour cet épisode pour le moment. Générez-le d&apos;abord à l&apos;étape « Cut » du
            tunnel de montage.
          </p>
        </div>
      ) : (
        <>
          <button type="button" onClick={suggestHooks} disabled={suggesting} className={pillBtn}>
            {suggesting ? `Recherche des meilleurs passages... ${suggestProgress}%` : "✨ Suggérer les meilleurs passages (IA)"}
          </button>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <div className="rounded-xl bg-mint p-4 space-y-2">
              <h2 className="font-medium text-mint-ink text-sm">Transcript</h2>
              <div className="max-h-[28rem] overflow-y-auto space-y-1">
                {transcript.map((sentence) => {
                  const added = addedIds.has(sentence.id);
                  return (
                    <div
                      key={sentence.id}
                      className={`rounded-md bg-white border border-border p-2.5 flex items-start justify-between gap-2 text-sm ${
                        added ? "opacity-50" : ""
                      }`}
                    >
                      <div>
                        <span className="text-xs text-text-muted mr-2">{formatTime(sentence.startMs)}</span>
                        {sentence.text}
                      </div>
                      <button
                        type="button"
                        onClick={() => addSegment(sentence)}
                        disabled={added}
                        className={`${pillBtn} shrink-0`}
                      >
                        {added ? "Ajouté" : "+ Ajouter"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
  
            <div className="rounded-xl bg-sky p-4 space-y-3">
              <h2 className="font-medium text-sky-ink text-sm">Séquence du teaser</h2>
              {introSegments.length === 0 ? (
                <p className="text-sm text-sky-ink/70">
                  Aucun passage choisi pour l&apos;instant. Ajoutez-en depuis le transcript.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {introSegments.map((seg, i) => {
                    // Cherche les mots dans TOUT le transcript (pas seulement
                    // une phrase dont les bornes correspondraient exactement à
                    // celles du passage) : un passage suggéré par l'IA ne
                    // couvre souvent qu'une SOUS-partie d'une phrase, jamais
                    // ses bornes exactes, chercher une correspondance stricte
                    // ne trouvait alors rien et retombait sur un unique "mot"
                    // couvrant tout le passage, rendant le mode "Cut"
                    // incapable de cibler un mot en particulier (tout se
                    // marquait/retirait d'un coup).
                    const words = flatWords.filter((w) => w.startMs >= seg.startMs && w.endMs <= seg.endMs);
                    const displayWords = words.length > 0 ? words : [{ text: seg.text, startMs: seg.startMs, endMs: seg.endMs }];
                    const inCutMode = cutModeSegmentId === seg.id;

                    function openCutMode() {
                      setCutModeSegmentId(inCutMode ? null : seg.id);
                    }

                    function wordMouseDown(e: React.MouseEvent, idx: number, word: TranscriptWord) {
                      if (isWordRemoved(word, seg.removedRanges)) {
                        removeRangeCovering(seg, word);
                        return;
                      }
                      e.preventDefault();
                      window.getSelection?.()?.removeAllRanges();
                      isDraggingWordsRef.current = true;
                      mouseDownPosRef.current = { x: e.clientX, y: e.clientY };
                      dragWordStateRef.current = { anchor: idx, end: idx };
                      setDragWordAnchor(idx);
                      setDragWordEnd(idx);
                    }

                    function wordMouseEnter(e: React.MouseEvent, idx: number) {
                      if (!isDraggingWordsRef.current || !mouseDownPosRef.current) return;
                      const dx = e.clientX - mouseDownPosRef.current.x;
                      const dy = e.clientY - mouseDownPosRef.current.y;
                      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
                      dragWordStateRef.current = { ...dragWordStateRef.current, end: idx };
                      setDragWordEnd(idx);
                    }

                    return (
                      <li
                        key={seg.id}
                        draggable={!inCutMode}
                        onDragStart={() => setDragIndex(i)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => handleDrop(i)}
                        className={`rounded-md bg-white border border-border p-2.5 text-sm ${
                          dragIndex === i ? "opacity-40" : ""
                        }`}
                      >
                        <div className={`flex items-start gap-2 ${inCutMode ? "" : "cursor-move"}`}>
                          <span className="text-xs text-text-muted font-semibold shrink-0 mt-0.5">{i + 1}.</span>
                          {/* Texte de la phrase : reflète toujours l'état déjà coupé (mots
                              barrés), même en dehors du mode "Cut", pour voir d'un coup d'œil
                              ce qui a été retiré sans rouvrir l'éditeur mot par mot. */}
                          <span className="flex-1">
                            {displayWords.map((w, wi) => (
                              <span key={wi} className={isWordRemoved(w, seg.removedRanges) ? "line-through text-text-muted" : ""}>
                                {w.text}{" "}
                              </span>
                            ))}
                          </span>
                          <button
                            type="button"
                            draggable={false}
                            onClick={openCutMode}
                            className={`text-[11px] font-semibold rounded-pill border px-2.5 py-1 shrink-0 transition ${
                              inCutMode
                                ? "bg-accent-teal border-accent-teal text-white hover:brightness-110"
                                : "bg-white border-border text-ink hover:bg-[#FAFAF8]"
                            }`}
                            title="Retirer des mots de cette phrase"
                          >
                            {inCutMode ? "Terminé" : "Cut"}
                          </button>
                          <button
                            type="button"
                            draggable={false}
                            onClick={() => removeSegment(seg.id)}
                            className="text-xs text-[#8A2E1F] shrink-0 mt-0.5"
                            title="Retirer"
                          >
                            ✕
                          </button>
                        </div>
                        {inCutMode && (
                          <div draggable={false} className="mt-2 pt-2 border-t border-border select-none leading-loose">
                            <p className="text-xs text-text-muted mb-1">
                              Cliquez sur un mot, ou cliquez-glissez sur plusieurs, pour les retirer de ce passage.
                            </p>
                            {displayWords.map((w, wi) => {
                              const removed = isWordRemoved(w, seg.removedRanges);
                              const dragging =
                                dragWordAnchor !== null &&
                                dragWordEnd !== null &&
                                wi >= Math.min(dragWordAnchor, dragWordEnd) &&
                                wi <= Math.max(dragWordAnchor, dragWordEnd);
                              return (
                                <span
                                  key={wi}
                                  draggable={false}
                                  onMouseDown={(e) => wordMouseDown(e, wi, w)}
                                  onMouseEnter={(e) => wordMouseEnter(e, wi)}
                                  className={`cursor-pointer rounded px-0.5 ${
                                    removed
                                      ? "bg-[#F4D5D0] line-through decoration-[#8A2E1F]/50"
                                      : dragging
                                        ? "bg-[#FBE0DC]"
                                        : "hover:bg-[#FAFAF8]"
                                  }`}
                                >
                                  {w.text}{" "}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
  
              <div className="pt-2 border-t border-border space-y-3">
                <Button onClick={buildTeaser} disabled={building || introSegments.length === 0} className="w-full">
                  {building ? `Génération en cours... ${displayedBuildProgress}%` : "Générer l'intro"}
                </Button>
              </div>
            </div>
          </div>

          {teaserUrl && (
            <div className="rounded-xl bg-mint p-4">
              <h2 className="font-medium text-mint-ink text-sm mb-3">Aperçu de l&apos;intro</h2>
              <div className="flex flex-col lg:flex-row gap-4 items-start">
                <video src={teaserUrl} controls className="w-full lg:w-2/3 rounded-md bg-black" />
                <div className="w-full lg:w-1/3">
                  <Button onClick={validateIntro} disabled={validating} className="w-full">
                    {validating ? "Validation..." : "Valider l'intro"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
