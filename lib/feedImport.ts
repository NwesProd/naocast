import { safeFetch } from "@/lib/safeFetch";
import { simpleHtml } from "@/lib/rss";

// Lecture d'un flux RSS de podcast existant (migration depuis un autre hébergeur) et rapprochement de ses
// épisodes avec ceux déjà créés dans naocast.

export interface FeedChannel {
  title: string;
  author: string | null;
  ownerEmail: string | null;
  description: string | null;
  language: string | null;
  category: string | null;
  explicit: boolean;
  link: string | null;
  imageUrl: string | null;
  newFeedUrl: string | null;
}
export interface FeedItem {
  guid: string;
  title: string;
  pubDate: Date | null;
  audioUrl: string;
  sizeBytes: number | null;
  season: number | null;
  episode: number | null;
  description: string | null;
}

function decode(v: string): string {
  return v
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]) : null;
}
function attr(block: string, name: string, attribute: string): string | null {
  const m = block.match(new RegExp(`<${name}\\s[^>]*?${attribute}="([^"]*)"`, "i"));
  return m ? decode(m[1]) : null;
}

// Mention ajoutée automatiquement par l'ancien hébergeur en fin de description (« Hébergé par X. Visitez ... pour plus
// d'informations. ») : sans objet une fois le podcast chez naocast.
export function stripHostFooter(text: string): string {
  return text
    .replace(/(?:<br\s*\/?>\s*)*<p>\s*Hébergé par [^<]*\.\s*Visitez[\s\S]*?pour plus d'informations\.\s*<\/p>/gi, "")
    .replace(/\s*Hébergé par [^\n<]*\.\s*Visitez [^\n<]* pour plus d'informations\.\s*$/i, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseFeed(xml: string): { channel: FeedChannel; items: FeedItem[] } {
  if (!/<rss[\s>]/i.test(xml) && !/<channel[\s>]/i.test(xml)) throw new Error("Cette adresse ne ressemble pas à un flux de podcast (RSS).");
  const firstItem = xml.search(/<item[\s>]/i);
  const head = firstItem >= 0 ? xml.slice(0, firstItem) : xml;
  const channel: FeedChannel = {
    title: tag(head, "title") ?? "",
    author: tag(head, "itunes:author"),
    ownerEmail: tag(tag(head, "itunes:owner") ?? "", "itunes:email"),
    description: stripHostFooter(tag(head, "description") ?? tag(head, "itunes:summary") ?? "") || null,
    language: tag(head, "language"),
    category: attr(head, "itunes:category", "text"),
    explicit: /^(true|yes)$/i.test(tag(head, "itunes:explicit") ?? ""),
    link: tag(head, "link"),
    imageUrl: attr(head, "itunes:image", "href") ?? tag(tag(head, "image") ?? "", "url"),
    newFeedUrl: tag(head, "itunes:new-feed-url"),
  };
  const items: FeedItem[] = [];
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const block = m[0];
    const audioUrl = attr(block, "enclosure", "url");
    if (!audioUrl) continue;
    const title = tag(block, "title") ?? "Sans titre";
    const num = (v: string | null) => (v && /^\d+$/.test(v.trim()) ? Number(v) : null);
    const date = tag(block, "pubDate");
    const html = tag(block, "content:encoded") ?? tag(block, "description");
    items.push({
      guid: tag(block, "guid") ?? audioUrl,
      title,
      pubDate: date && !Number.isNaN(Date.parse(date)) ? new Date(date) : null,
      audioUrl,
      sizeBytes: num(attr(block, "enclosure", "length")),
      season: num(tag(block, "itunes:season")),
      episode: num(tag(block, "itunes:episode")),
      description: html ? simpleHtml(stripHostFooter(html)) || null : null,
    });
  }
  return { channel, items };
}

export async function fetchFeed(url: string) {
  const res = await safeFetch(url, { headers: { Accept: "application/rss+xml, application/xml, text/xml, */*" } });
  if (!res.ok) throw new Error(`Le flux n'a pas répondu (${res.status}).`);
  const xml = await res.text();
  return parseFeed(xml);
}

// --- Rapprochement -------------------------------------------------------------------------

export function normalizeTitle(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(s\d+\s*e\d+|saison\s*\d+|episode|ep|#)\s*\d*\b[\s:.\-–]*/g, " ")
    .replace(/^\s*#?\d+\s*[:.\-–]\s*/, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = bigrams(a);
  const B = bigrams(b);
  let inter = 0;
  for (const [g, n] of A) inter += Math.min(n, B.get(g) ?? 0);
  return (2 * inter) / (Math.max(a.length - 1, 0) + Math.max(b.length - 1, 0) || 1);
}

export interface ExistingEpisode {
  id: string;
  title: string | null;
  season: number | null;
  episodeNumber: number | null;
  releaseDate: Date | null;
}
export type Confidence = "high" | "maybe" | "none";

// Un épisode naocast n'est proposé qu'une fois ; les meilleures correspondances sont attribuées en premier.
export function matchEpisodes(items: FeedItem[], existing: ExistingEpisode[]): { episodeId: string | null; confidence: Confidence }[] {
  const DAY = 86_400_000;
  const scored: { item: number; ep: number; score: number; high: boolean }[] = [];
  items.forEach((it, i) => {
    const nt = normalizeTitle(it.title);
    existing.forEach((ep, j) => {
      let score = similarity(nt, normalizeTitle(ep.title ?? ""));
      const sameNumber = it.episode != null && ep.episodeNumber != null && it.episode === ep.episodeNumber && (it.season ?? 0) === (ep.season ?? 0);
      const closeDate = it.pubDate && ep.releaseDate && Math.abs(it.pubDate.getTime() - ep.releaseDate.getTime()) <= 3 * DAY;
      if (closeDate) score += 0.15;
      if (sameNumber) score += 0.5;
      scored.push({ item: i, ep: j, score, high: score >= 0.85 || (sameNumber && score >= 0.5) });
    });
  });
  scored.sort((a, b) => b.score - a.score);
  const result: { episodeId: string | null; confidence: Confidence }[] = items.map(() => ({ episodeId: null, confidence: "none" }));
  const usedItem = new Set<number>();
  const usedEp = new Set<number>();
  for (const c of scored) {
    if (c.score < 0.55 || usedItem.has(c.item) || usedEp.has(c.ep)) continue;
    usedItem.add(c.item);
    usedEp.add(c.ep);
    result[c.item] = { episodeId: existing[c.ep].id, confidence: c.high ? "high" : "maybe" };
  }
  return result;
}
