// Import d'un transcript fait hors naocast (texte brut, .srt, .vtt) : transforme
// le texte en phrases + locuteurs, au même format que le transcript généré,
// pour qu'il s'affiche, se copie et s'exporte pareil. Fichier sans dépendance
// serveur (testable seul).

export interface ImportedSegment {
  startMs: number;
  endMs: number;
  text: string;
  speaker: string | null; // label, cf. ImportedSpeaker
}

export interface ImportedSpeaker {
  label: string; // "SPEAKER_00"... comme les labels pyannote.ai du transcript généré
  displayName: string;
}

export const MAX_TRANSCRIPT_CHARS = 1_000_000;
export const MAX_TRANSCRIPT_SEGMENTS = 20_000;

// 1:23, 01:23:45, 00:00:01,500, 00:00:01.500 ; éventuellement entre crochets.
const TIME_PREFIX = /^\[?(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?\]?\s*/;
const TIME_RANGE = /(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}\s*-->\s*(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}/;

function toMs(h: string | undefined, m: string, s: string, ms: string | undefined): number {
  const millis = ms ? Number(ms.padEnd(3, "0")) : 0;
  return ((Number(h ?? 0) * 60 + Number(m)) * 60 + Number(s)) * 1000 + millis;
}

function parseTimestamp(value: string): number | null {
  const match = value.trim().match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?$/);
  return match ? toMs(match[1], match[2], match[3], match[4]) : null;
}

function clean(text: string): string {
  return text.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

// "Nom : texte" (≤ 5 mots avant les deux-points), sinon pas de locuteur.
function splitSpeaker(line: string): { name: string | null; text: string } {
  const match = line.match(/^([^\s:][^:]{0,40}?)\s*:\s+(.+)$/);
  if (match && match[1].trim().split(/\s+/).length <= 5) return { name: match[1].trim(), text: match[2] };
  return { name: null, text: line };
}

interface RawSegment {
  startMs: number | null;
  endMs: number | null;
  name: string | null;
  text: string; // sans le "Nom : " de début
  own: boolean; // le nom vient de cette ligne (pas hérité de la ligne précédente)
  full: string; // ligne d'origine, "Nom : " compris (si le nom n'est finalement pas un locuteur)
}

function parseSubtitles(text: string): RawSegment[] {
  const raw: RawSegment[] = [];
  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    const timingIdx = lines.findIndex((l) => TIME_RANGE.test(l));
    if (timingIdx === -1) continue; // en-tête WEBVTT, NOTE...
    const [startRaw, endRaw] = lines[timingIdx].split("-->").map((p) => p.trim().split(/\s+/)[0]);
    const body = lines.slice(timingIdx + 1).join(" ");
    // Balise de voix WebVTT : <v Nom>texte
    const voice = body.match(/^<v(?:\.[^ ]*)?\s+([^>]+)>/);
    const cleaned = clean(body);
    const { name, text: content } = voice ? { name: voice[1].trim(), text: cleaned } : splitSpeaker(cleaned);
    if (!content) continue;
    raw.push({ startMs: parseTimestamp(startRaw), endMs: parseTimestamp(endRaw), name, text: content, own: !!name, full: cleaned });
  }
  return raw;
}

function parsePlain(text: string): RawSegment[] {
  const raw: RawSegment[] = [];
  for (const paragraph of text.split(/\n{2,}/)) {
    let current: string | null = null; // locuteur du paragraphe en cours
    for (const rawLine of paragraph.split("\n")) {
      let line = rawLine.trim();
      if (!line) continue;
      let startMs: number | null = null;
      const time = line.match(TIME_PREFIX);
      if (time) {
        startMs = toMs(time[1], time[2], time[3], time[4]);
        line = line.slice(time[0].length);
      }
      const { name, text: content } = splitSpeaker(line);
      const cleaned = clean(content);
      if (!cleaned) continue;
      if (name) current = name;
      raw.push({ startMs, endMs: null, name: name ?? current, text: cleaned, own: !!name, full: clean(line) });
    }
  }
  return raw;
}

export function parseTranscript(input: string): { segments: ImportedSegment[]; speakers: ImportedSpeaker[] } {
  const text = input.replace(/^﻿/, "").replace(/\r\n?/g, "\n").trim();
  const raw = TIME_RANGE.test(text) ? parseSubtitles(text) : parsePlain(text);

  // Un "Nom : texte" n'est un locuteur que si le texte a une vraie structure de
  // dialogue : au moins deux noms différents et une part notable de lignes
  // ainsi étiquetées, ou un même nom revenant au moins deux fois. Sinon
  // ("Attention : ..." isolé dans de la prose) ça reste du texte, avec son
  // "Nom : " d'origine.
  const counts = new Map<string, number>();
  let ownLines = 0;
  for (const r of raw) {
    if (r.name && r.own) {
      counts.set(r.name, (counts.get(r.name) ?? 0) + 1);
      ownLines++;
    }
  }
  const dialogue = counts.size >= 2 && ownLines / Math.max(1, raw.length) >= 0.3;
  const isSpeaker = (name: string | null): name is string => !!name && (dialogue || (counts.get(name) ?? 0) >= 2);

  const labels = new Map<string, string>();
  const speakers: ImportedSpeaker[] = [];
  const segments: ImportedSegment[] = [];
  const limited = raw.slice(0, MAX_TRANSCRIPT_SEGMENTS);

  limited.forEach((r, index) => {
    let speaker: string | null = null;
    if (isSpeaker(r.name)) {
      if (!labels.has(r.name)) {
        const label = `SPEAKER_${String(labels.size).padStart(2, "0")}`;
        labels.set(r.name, label);
        speakers.push({ label, displayName: r.name });
      }
      speaker = labels.get(r.name)!;
    }
    // Sans horodatage, l'index sert de position (début = fin) : l'ordre est
    // conservé au tri par startMs, et début = fin signale "sans horodatage".
    const startMs = r.startMs ?? index;
    const next = limited[index + 1]?.startMs;
    const endMs = r.endMs ?? (r.startMs !== null && next != null && next > r.startMs ? next : startMs);
    segments.push({ startMs, endMs, text: isSpeaker(r.name) ? r.text : r.full, speaker });
  });

  return { segments, speakers };
}
