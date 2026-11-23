import { prisma } from "@/lib/db";
import { getSignedDownloadUrl } from "@/lib/storage";
import { escapeHtml } from "@/lib/editingRequest";
import { formatShootTime } from "@/lib/shootMarkers";
import { fetchVideoStats } from "@/lib/youtube";
import { relatedSource } from "@/lib/diffusionStats";
import { todayInParis } from "@/lib/moduleProgress";

// Module Extraits : statuts, tarifs affichés et brief de montage d'un extrait.
export const CLIP_STATUS_KEYS = ["IDEA", "TO_EDIT", "READY", "PUBLISHED"] as const;
export type ClipStatus = (typeof CLIP_STATUS_KEYS)[number];

// Prix Stripe du montage d'un extrait (STRIPE_PRICE_CLIP_EDITING), à créer dans Stripe : 60 € HT.
export const CLIP_PRICE_ID = process.env.STRIPE_PRICE_CLIP_EDITING || "";

// Identifiant de vidéo à partir d'un lien YouTube : youtu.be/ID, youtube.com/watch?v=ID, /shorts/ID, /embed/ID.
export function parseYoutubeVideoId(input: string): string | null {
  const text = input.trim();
  if (/^[\w-]{11}$/.test(text)) return text;
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return url.pathname.slice(1).split("/")[0] || null;
    if (host.endsWith("youtube.com")) {
      const v = url.searchParams.get("v");
      if (v) return v;
      const m = /\/(shorts|embed|live)\/([\w-]{11})/.exec(url.pathname);
      if (m) return m[2];
    }
  } catch {
    return null;
  }
  return null;
}

// Relie la vidéo publiée d'un extrait à l'épisode comme contenu annexe (Diffusion), pour suivre ses vues.
// Best-effort : sans clé YouTube ou si la vidéo est introuvable, le lien reste simplement enregistré.
export async function linkPublishedClip(episodeId: string, videoId: string): Promise<void> {
  try {
    const stats = (await fetchVideoStats([videoId])).get(videoId);
    if (!stats) return;
    await prisma.relatedContent.upsert({
      where: { episodeId_videoId: { episodeId, videoId } },
      update: { title: stats.title, views: stats.views, likes: stats.likes, comments: stats.comments },
      create: { episodeId, videoId, title: stats.title, views: stats.views, likes: stats.likes, comments: stats.comments },
    });
    const day = new Date(todayInParis());
    await prisma.statSnapshot.upsert({
      where: { episodeId_source_day: { episodeId, source: relatedSource(videoId), day } },
      update: { views: stats.views, likes: stats.likes, comments: stats.comments },
      create: { episodeId, source: relatedSource(videoId), day, views: stats.views, likes: stats.likes, comments: stats.comments },
    });
  } catch {
    // clé absente, quota ou vidéo privée : on garde le lien seul
  }
}

// Brief de montage d'un extrait (envoyé au monteur) : titre, passage (timecodes dans la vidéo finale ou les
// rushs), texte du passage, et liens de téléchargement valables 7 jours.
export async function renderClipBrief(clipId: string, notes: string | null, from: string): Promise<{ subject: string; html: string }> {
  const clip = await prisma.clip.findUniqueOrThrow({
    where: { id: clipId },
    include: { episode: { include: { podcast: { include: { mediaAssets: true } }, rushes: true, exports: true } } },
  });
  const WEEK = 7 * 24 * 3600;
  const link = async (label: string, key: string | null | undefined) =>
    key ? `<li><a href="${await getSignedDownloadUrl(key, WEEK)}">${escapeHtml(label)}</a></li>` : "";
  const video = clip.episode.exports.find((e) => e.type === "VIDEO");
  const sources = [
    await link("Vidéo finale de l'épisode", video?.storageKey),
    ...(await Promise.all(clip.episode.rushes.map((r) => link(r.originalFilename || "Rush", r.storageKey)))),
  ].join("");
  const podcast = clip.episode.podcast;
  const library = [
    await link("Logo", podcast.logoKey),
    await link("Jingle", podcast.jingleKey),
    ...(await Promise.all(podcast.mediaAssets.map((a) => link(`${a.name} (${a.type})`, a.key)))),
  ].join("");
  const html = `
    <h1>Extrait à monter : ${escapeHtml(clip.title)}</h1>
    <p>${escapeHtml(podcast.title)} : ${escapeHtml(clip.episode.title ?? "Sans titre")}</p>
    <h3>Passage</h3>
    <p><strong>${formatShootTime(clip.startMs)} à ${formatShootTime(clip.endMs)}</strong> dans la vidéo de l'épisode.</p>
    <p style="white-space:pre-wrap;color:#444">${escapeHtml(clip.excerpt)}</p>
    ${notes?.trim() ? `<h3>Consignes</h3><p style="white-space:pre-wrap">${escapeHtml(notes.trim())}</p>` : ""}
    <h3>Fichiers</h3>
    <ul>${sources || "<li>Aucun</li>"}</ul>
    <h3>Logo, jingle et sons du podcast</h3>
    <ul>${library || "<li>Aucun</li>"}</ul>
    <p>Liens valables 7 jours. ${escapeHtml(from)}</p>
  `;
  return { subject: `Extrait à monter : ${clip.title}`, html };
}
