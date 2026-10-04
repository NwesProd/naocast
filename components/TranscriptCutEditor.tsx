"use client";

import { useEffect, useRef, useState } from "react";
import { groupBySpeaker } from "@/lib/transcriptGrouping";

export interface TranscriptWord {
  text: string;
  startMs: number;
  endMs: number;
}

export interface TranscriptSegment {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  speaker: string | null;
  words: TranscriptWord[] | null;
}

export interface Speaker {
  id: string;
  label: string;
  displayName: string | null;
}

// Passage que l'IA propose de couper (étape "Cut") : surligné en jaune, pas
// encore une vraie coupe tant qu'il n'est pas accepté.
export interface CutSuggestionRange {
  id: string;
  startMs: number;
  endMs: number;
}

export interface CutMarker {
  id: string;
  startMs: number;
  endMs: number;
  source: string;
}

function formatTime(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Éditeur "recouper un passage" : sélection au mot près façon traitement de
// texte (cliquer-glisser), pas seulement phrase par phrase, un premier
// jet ne permettait de marquer que des phrases entières, trop grossier en
// usage réel où on veut souvent ne retirer que quelques mots. Partagé entre
// le tunnel de montage (étape "Cut") et la relecture, mêmes horodatages
// (words) et même logique de marquage des deux côtés.
export function TranscriptCutEditor({
  episodeId,
  transcript,
  speakers,
  cutMarkers,
  suggestions = [],
  onCutMarkersChange,
}: {
  episodeId: string;
  transcript: TranscriptSegment[];
  speakers: Speaker[];
  cutMarkers: CutMarker[];
  suggestions?: CutSuggestionRange[];
  onCutMarkersChange: (updater: (markers: CutMarker[]) => CutMarker[]) => void;
}) {
  const [dragAnchorIdx, setDragAnchorIdx] = useState<number | null>(null);
  const [dragEndIdx, setDragEndIdx] = useState<number | null>(null);
  const isDraggingRef = useRef(false);
  // Valeurs courantes accessibles depuis le listener global mouseup, tenues à
  // jour EN MÊME TEMPS que le state (jamais via un effect séparé) : un clic
  // rapide (mousedown puis mouseup quasi immédiat, cas normal d'un simple
  // clic humain) peut survenir avant qu'un effect n'ait eu le temps de
  // s'exécuter après le rendu déclenché par setDragAnchorIdx/setDragEndIdx,
  // le mouseup lisait alors encore les anciennes valeurs (souvent {null,
  // null}) et ne créait aucun marker. Muter la ref au même endroit que
  // l'appel à setState élimine ce décalage.
  const dragStateRef = useRef<{ anchor: number | null; end: number | null }>({ anchor: null, end: null });
  // Position du curseur au mousedown, pour ignorer les micro-mouvements
  // (tremblement de la main, trackpad) qui font passer le curseur sur le mot
  // voisin sans intention réelle de glisser, sans ce seuil, un simple clic
  // pouvait étendre la sélection au mot d'à côté, voire à toute la ligne.
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null);
  const DRAG_THRESHOLD_PX = 6;

  // Miroir synchrone de `cutMarkers`, mis à jour immédiatement à chaque
  // création/suppression optimiste (pas seulement quand React re-rend et que
  // la prop `cutMarkers` se met à jour). Sans ça : un double-clic rapide
  // (mousedown+mouseup, mousedown+mouseup en quelques dizaines de ms) fait
  // partir la 2e requête AVANT que la réponse serveur de la 1re n'ait mis à
  // jour l'état, la 2e lisait alors encore "aucun marker" via la prop
  // `cutMarkers` restée périmée, et créait un doublon au lieu de basculer
  // création → suppression (constaté en conditions réelles).
  const cutMarkersRef = useRef<CutMarker[]>(cutMarkers);
  useEffect(() => {
    cutMarkersRef.current = cutMarkers;
  }, [cutMarkers]);
  // Ids temporaires annulés (marker retiré) avant que leur requête de
  // création n'ait eu le temps de répondre, sans ce suivi, le marker créé
  // entre-temps côté serveur restait orphelin en base (jamais supprimé,
  // puisqu'on ne connaissait pas encore son vrai id au moment de l'annuler).
  const pendingRemovalsRef = useRef<Set<string>>(new Set());

  // Liste à plat de tous les mots du transcript, dans l'ordre, la sélection
  // (glisser-cliquer) opère sur cette liste, indépendamment des frontières
  // de phrase. Reconstruite à l'identique pendant le rendu (même ordre) pour
  // associer chaque <span> à son index global sans recherche coûteuse.
  const flatWords: (TranscriptWord & { segId: string })[] = [];
  for (const seg of transcript) {
    const words = seg.words && seg.words.length > 0 ? seg.words : [{ text: seg.text, startMs: seg.startMs, endMs: seg.endMs }];
    for (const w of words) flatWords.push({ ...w, segId: seg.id });
  }

  async function finalizeSelection(from: number, to: number) {
    const startMs = flatWords[from].startMs;
    const endMs = flatWords[to].endMs;

    const existing = cutMarkersRef.current.find((m) => m.startMs === startMs && m.endMs === endMs);
    if (existing) {
      await cancelOrDeleteMarker(existing);
      return;
    }

    // Marker optimiste (id temporaire) posé immédiatement, avant même
    // l'appel réseau, pour que le prochain clic, même très rapproché, voie
    // tout de suite ce nouvel état via cutMarkersRef plutôt qu'une prop
    // encore périmée.
    const tempId = `temp-${startMs}-${endMs}-${Date.now()}`;
    const optimisticMarker: CutMarker = { id: tempId, startMs, endMs, source: "MANUAL" };
    cutMarkersRef.current = [...cutMarkersRef.current, optimisticMarker];
    onCutMarkersChange((m) => [...m, optimisticMarker]);

    const res = await fetch(`/api/episodes/${episodeId}/cut-markers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startMs, endMs }),
    });
    const marker: CutMarker = await res.json();

    if (pendingRemovalsRef.current.has(tempId)) {
      // Annulé entre-temps (l'utilisateur a recliqué avant la réponse) :
      // supprimer côté serveur plutôt que de laisser un marker fantôme,
      // l'état local a déjà été mis à jour au moment de l'annulation.
      pendingRemovalsRef.current.delete(tempId);
      await fetch(`/api/episodes/${episodeId}/cut-markers/${marker.id}`, { method: "DELETE" });
      return;
    }

    // Remplace le marker optimiste par le vrai (id serveur).
    cutMarkersRef.current = cutMarkersRef.current.map((m) => (m.id === tempId ? marker : m));
    onCutMarkersChange((m) => m.map((x) => (x.id === tempId ? marker : x)));
  }

  async function cancelOrDeleteMarker(existing: CutMarker) {
    cutMarkersRef.current = cutMarkersRef.current.filter((x) => x.id !== existing.id);
    onCutMarkersChange((m) => m.filter((x) => x.id !== existing.id));
    if (existing.id.startsWith("temp-")) {
      pendingRemovalsRef.current.add(existing.id);
      return;
    }
    await fetch(`/api/episodes/${episodeId}/cut-markers/${existing.id}`, { method: "DELETE" });
  }

  useEffect(() => {
    function handleMouseUp() {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      mouseDownPosRef.current = null;
      window.getSelection?.()?.removeAllRanges();
      const { anchor, end } = dragStateRef.current;
      if (anchor === null || end === null) return;
      finalizeSelection(Math.min(anchor, end), Math.max(anchor, end));
      setDragAnchorIdx(null);
      setDragEndIdx(null);
    }
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcript, cutMarkers]);

  function speakerDisplay(label: string | null): string | null {
    if (!label) return null;
    const idx = speakers.findIndex((sp) => sp.label === label);
    if (idx === -1) return label;
    return speakers[idx].displayName || `Locuteur ${idx + 1}`;
  }

  async function removeMarkerCovering(word: TranscriptWord) {
    const existing = cutMarkersRef.current.find((m) => word.startMs >= m.startMs && word.endMs <= m.endMs);
    if (!existing) return;
    await cancelOrDeleteMarker(existing);
  }

  function isMarked(word: TranscriptWord): boolean {
    return cutMarkers.some((m) => word.startMs >= m.startMs && word.endMs <= m.endMs);
  }

  function isSuggested(word: TranscriptWord): boolean {
    return suggestions.some((sg) => word.startMs >= sg.startMs && word.endMs <= sg.endMs);
  }

  // Premier mot de chaque proposition : sert d'ancre pour y faire défiler la
  // page depuis la liste des propositions (id "sug-<id>").
  const suggestionAnchors = new Map<number, string>();
  for (const sg of suggestions) {
    const first = flatWords.findIndex((w) => w.startMs >= sg.startMs && w.endMs <= sg.endMs);
    if (first !== -1) suggestionAnchors.set(first, sg.id);
  }

  function isDragSelected(idx: number): boolean {
    if (dragAnchorIdx === null || dragEndIdx === null) return false;
    return idx >= Math.min(dragAnchorIdx, dragEndIdx) && idx <= Math.max(dragAnchorIdx, dragEndIdx);
  }

  let globalIndex = 0;

  return (
    <div className="space-y-2">
      <p className="text-sm text-mint-muted">
        Cliquez-glissez sur les mots à supprimer (ils passent en rouge). Les passages en jaune sont des propositions
        de l&apos;IA, à accepter ou refuser dans la liste. Cliquez sur un passage déjà marqué pour l&apos;annuler. Cliquez sur le nom d&apos;un locuteur pour marquer toute sa prise de parole.
      </p>
      <div className="max-h-[32rem] overflow-y-auto rounded-md bg-white border border-border p-4 text-base leading-loose select-none">
        {groupBySpeaker(transcript).map((turn) => {
          const speakerName = speakerDisplay(turn.speaker);
          // Tous les mots de la prise de parole, dans l'ordre : les phrases
          // consécutives d'un même locuteur forment un seul paragraphe, mais
          // chaque mot garde son index global (même ordre que `flatWords`).
          const words = turn.segments.flatMap((seg) =>
            seg.words && seg.words.length > 0 ? seg.words : [{ text: seg.text, startMs: seg.startMs, endMs: seg.endMs }]
          );
          const segStartIdx = globalIndex;
          const segEndIdx = segStartIdx + words.length - 1;
          return (
            <p key={turn.segments[0].id} className="mb-3">
              <span className="text-text-muted mr-2 text-sm">{formatTime(turn.startMs)}</span>
              {speakerName && (
                <span
                  onClick={() => finalizeSelection(segStartIdx, segEndIdx)}
                  className="mr-2 text-sm font-semibold text-[#0F6B67] cursor-pointer hover:underline"
                  title="Sélectionner toute sa prise de parole pour la couper"
                >
                  {speakerName} :
                </span>
              )}
              {words.map((w, i) => {
                const idx = globalIndex++;
                const marked = isMarked(w);
                const suggested = !marked && isSuggested(w);
                const dragging = isDragSelected(idx);
                const anchorId = suggestionAnchors.get(idx);
                return (
                  <span
                    key={i}
                    id={anchorId ? `sug-${anchorId}` : undefined}
                    onMouseDown={(e) => {
                      if (marked) {
                        removeMarkerCovering(w);
                        return;
                      }
                      // Empêche la sélection de texte native du navigateur de
                      // démarrer : sans ça, elle peut prendre le dessus sur le
                      // clic et étendre visuellement la sélection bien
                      // au-delà du mot cliqué (jusqu'à toute la phrase),
                      // indépendamment de la logique ci-dessous. Un double ou
                      // triple clic rapproché (l'utilisateur recliquant faute
                      // de retour visuel immédiat, par exemple) peut déclencher
                      // la sélection "mot"/"paragraphe" native du navigateur
                      // malgré preventDefault sur certains navigateurs, on la
                      // supprime explicitement en plus, par sécurité.
                      e.preventDefault();
                      window.getSelection?.()?.removeAllRanges();
                      isDraggingRef.current = true;
                      mouseDownPosRef.current = { x: e.clientX, y: e.clientY };
                      dragStateRef.current = { anchor: idx, end: idx };
                      setDragAnchorIdx(idx);
                      setDragEndIdx(idx);
                    }}
                    onMouseEnter={(e) => {
                      if (!isDraggingRef.current || !mouseDownPosRef.current) return;
                      const dx = e.clientX - mouseDownPosRef.current.x;
                      const dy = e.clientY - mouseDownPosRef.current.y;
                      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
                      dragStateRef.current = { ...dragStateRef.current, end: idx };
                      setDragEndIdx(idx);
                    }}
                    className={`cursor-pointer rounded px-0.5 ${
                      marked
                        ? "bg-[#F4D5D0] line-through decoration-[#8A2E1F]/50"
                        : dragging
                          ? "bg-[#FBE0DC]"
                          : suggested
                            ? "bg-[#FFF1C9] underline decoration-dotted decoration-[#8A5300]/60"
                            : "hover:bg-[#FAFAF8]"
                    }`}
                  >
                    {w.text}{" "}
                  </span>
                );
              })}
            </p>
          );
        })}
      </div>
    </div>
  );
}
