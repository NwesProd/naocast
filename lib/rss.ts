import { prisma } from "@/lib/db";
import { appUrl } from "@/lib/email";
import { getObjectSize } from "@/lib/storage";

export { PLATFORMS, LANGUAGES, CATEGORIES } from "@/lib/rssConstants";

// Flux RSS d'un podcast hébergé par naocast : c'est lui que lisent Apple Podcasts, Spotify et Deezer.

export interface HostingFields {
  title: string;
  author: string | null;
  ownerEmail: string | null;
  description: string | null;
  language: string;
  category: string | null;
  coverKey: string | null;
}

// Champs obligatoires du flux manquants (libellés affichés à l'utilisateur).
export function missingHostingFields(p: HostingFields): string[] {
  const missing: string[] = [];
  if (!p.coverKey) missing.push("pochette du podcast (Bibliothèque de médias)");
  if (!p.author?.trim()) missing.push("auteur");
  if (!p.ownerEmail?.trim()) missing.push("e-mail du propriétaire");
  if (!p.description?.trim()) missing.push("description du podcast");
  if (!p.category?.trim()) missing.push("catégorie");
  return missing;
}

export function slugify(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "podcast"
  );
}

// Adresse du flux : choisie une fois, elle ne change plus (les plateformes l'enregistrent).
export async function ensureRssSlug(podcastId: string, title: string): Promise<string> {
  const existing = await prisma.podcast.findUnique({ where: { id: podcastId }, select: { rssSlug: true } });
  if (existing?.rssSlug) return existing.rssSlug;
  const base = slugify(title);
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const taken = await prisma.podcast.findUnique({ where: { rssSlug: candidate }, select: { id: true } });
    if (!taken) {
      await prisma.podcast.update({ where: { id: podcastId }, data: { rssSlug: candidate } });
      return candidate;
    }
  }
  throw new Error("Impossible de créer l'adresse du flux.");
}

export function feedUrl(slug: string): string {
  return `${appUrl()}/api/rss/${slug}`;
}

export function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

const cdata = (value: string) => `<![CDATA[${value.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;

// HTML de l'éditeur -> HTML simple accepté par les plateformes (paragraphes, gras, italique, listes, liens).
// Les titres deviennent du gras ; tout le reste (souligné, classes...) est retiré.
export function simpleHtml(html: string): string {
  return html
    .replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, "<p><strong>$1</strong></p>")
    .replace(/<(\/?)(b|strong|i|em|ul|ol|li|p|br)(\s[^>]*)?>/gi, (_m, slash, tag) => `<${slash}${String(tag).toLowerCase()}>`)
    .replace(/<a\s[^>]*href="(https?:\/\/[^"]+)"[^>]*>/gi, '<a href="$1">')
    .replace(/<(?!\/?(?:p|br|b|strong|i|em|ul|ol|li|a)\b)[^>]*>/gi, "")
    .trim();
}

export function plainText(html: string): string {
  return simpleHtml(html)
    .replace(/<\/(p|li)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Catégorie Apple, avec sa sous-catégorie quand elle est choisie (« Business/Marketing »).
function categoryXml(value: string | null): string {
  if (!value) return "";
  const [main, sub] = value.split("/");
  return sub
    ? `<itunes:category text="${escapeXml(main)}"><itunes:category text="${escapeXml(sub)}"/></itunes:category>`
    : `<itunes:category text="${escapeXml(main)}"/>`;
}

// Les applications et validateurs relisent le flux très souvent : on garde le résultat une minute, et la taille
// de chaque fichier audio dix minutes (elle ne change qu'au remplacement du fichier).
const FEED_TTL_MS = 60_000;
const SIZE_TTL_MS = 10 * 60_000;
const feedCache = new Map<string, { at: number; xml: string }>();
const sizeCache = new Map<string, { at: number; size: number }>();

async function cachedSize(key: string): Promise<number> {
  const hit = sizeCache.get(key);
  if (hit && Date.now() - hit.at < SIZE_TTL_MS) return hit.size;
  const size = (await getObjectSize(key)) ?? 0;
  if (size > 0) sizeCache.set(key, { at: Date.now(), size });
  return size;
}

export async function buildFeed(slug: string): Promise<string | null> {
  const hit = feedCache.get(slug);
  if (hit && Date.now() - hit.at < FEED_TTL_MS) return hit.xml;
  const xml = await buildFeedUncached(slug);
  if (xml) feedCache.set(slug, { at: Date.now(), xml });
  return xml;
}

// Construit le flux d'un podcast (null si le podcast n'est pas hébergé par naocast).
async function buildFeedUncached(slug: string): Promise<string | null> {
  const podcast = await prisma.podcast.findUnique({ where: { rssSlug: slug } });
  if (!podcast || !podcast.hostingMode) return null;

  const episodes = await prisma.episode.findMany({
    where: { podcastId: podcast.id, audioPublishedAt: { not: null } },
    include: { exports: { where: { type: "AUDIO" }, take: 1 } },
    orderBy: { releaseDate: "desc" },
  });

  const base = appUrl();
  const coverExt = podcast.coverKey?.split(".").pop()?.toLowerCase() || "jpg";
  // Les applications gardent chaque pochette en mémoire d'après son adresse : un court identifiant de version dans
  // l'adresse la fait relire dès qu'on remplace l'image.
  const version = (key: string) => (key.split("/").pop() ?? "").slice(0, 8);
  const coverUrl = podcast.coverKey ? `${base}/api/rss/${slug}/cover/cover-${version(podcast.coverKey)}.${coverExt}` : null;
  const explicit = podcast.explicit ? "true" : "false";

  const sizes = await Promise.all(episodes.map((e) => (e.exports[0] ? cachedSize(e.exports[0].storageKey) : Promise.resolve(0))));
  const items: string[] = [];
  for (const [i, e] of episodes.entries()) {
    const audio = e.exports[0];
    if (!audio) continue;
    const size = sizes[i];
    const guid = e.rssGuid || e.id;
    // Épisode repris d'un autre hébergeur : on garde sa date de publication d'origine (jour et heure), pour que les
    // plateformes ne voient aucun changement. Sinon, la date de sortie choisie dans naocast.
    const pub = (e.rssGuid ? (e.audioPublishedAt ?? e.releaseDate) : (e.releaseDate ?? e.audioPublishedAt) ?? new Date())?.toUTCString() ?? new Date().toUTCString();
    const html = e.description ? simpleHtml(e.description) : "";
    items.push(`    <item>
      <title>${escapeXml(e.audioTitle?.trim() || e.title || "Sans titre")}</title>
      <link>${escapeXml(podcast.website || base)}</link>
      <guid isPermaLink="false">${escapeXml(guid)}</guid>
      <pubDate>${pub}</pubDate>
      <enclosure url="${base}/api/rss/${slug}/audio/${e.id}.mp3" length="${size}" type="audio/mpeg"/>
      ${html ? `<description>${cdata(html)}</description>\n      <content:encoded>${cdata(html)}</content:encoded>\n      <itunes:summary>${cdata(plainText(html))}</itunes:summary>` : ""}
      <itunes:explicit>${explicit}</itunes:explicit>
      <itunes:episodeType>full</itunes:episodeType>
      ${e.episodeNumber != null ? `<itunes:episode>${e.episodeNumber}</itunes:episode>` : ""}
      ${e.season != null ? `<itunes:season>${e.season}</itunes:season>` : ""}
      ${e.coverKey ? `<itunes:image href="${base}/api/rss/${slug}/episode-cover/${e.id}-${version(e.coverKey)}.${e.coverKey.split(".").pop()?.toLowerCase() || "jpg"}"/>` : coverUrl ? `<itunes:image href="${coverUrl}"/>` : ""}
    </item>`);
  }

  const desc = podcast.description || podcast.title;
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(podcast.title)}</title>
    <link>${escapeXml(podcast.website || base)}</link>
    <atom:link href="${feedUrl(slug)}" rel="self" type="application/rss+xml"/>
    <language>${escapeXml(podcast.language)}</language>
    <description>${cdata(desc)}</description>
    <itunes:summary>${cdata(desc)}</itunes:summary>
    <itunes:author>${escapeXml(podcast.author || podcast.title)}</itunes:author>
    <itunes:owner>
      <itunes:name>${escapeXml(podcast.author || podcast.title)}</itunes:name>
      ${podcast.ownerEmail ? `<itunes:email>${escapeXml(podcast.ownerEmail)}</itunes:email>` : ""}
    </itunes:owner>
    <itunes:explicit>${explicit}</itunes:explicit>
    <itunes:type>episodic</itunes:type>
    ${categoryXml(podcast.category)}
    ${coverUrl ? `<itunes:image href="${coverUrl}"/>\n    <image><url>${coverUrl}</url><title>${escapeXml(podcast.title)}</title><link>${escapeXml(podcast.website || base)}</link></image>` : ""}
${items.join("\n")}
  </channel>
</rss>
`;
}
