// Statistiques YouTube du module Diffusion : API YouTube Data v3 (données publiques des vidéos),
// avec la clé YOUTUBE_API_KEY de naocast. Aucune connexion Google de l'utilisateur.
const API = "https://www.googleapis.com/youtube/v3";

export class YouTubeError extends Error {}

function apiKey(): string {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new YouTubeError("Les statistiques YouTube ne sont pas encore activées sur naocast.");
  return key;
}

async function yt<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = `${API}/${path}?${new URLSearchParams({ ...params, key: apiKey() }).toString()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string; errors?: { reason?: string }[] } } | null;
    const reason = body?.error?.errors?.[0]?.reason;
    if (reason === "quotaExceeded" || reason === "rateLimitExceeded") throw new YouTubeError("Limite quotidienne de YouTube atteinte, réessaie demain.");
    if (reason === "keyInvalid" || res.status === 400 || res.status === 403) throw new YouTubeError("L'accès à YouTube est mal configuré sur naocast.");
    throw new YouTubeError("YouTube ne répond pas, réessaie dans un instant.");
  }
  return (await res.json()) as T;
}

// Adresse de chaîne saisie par l'utilisateur : @handle, adresse /@handle, /channel/UC…, /user/nom ou identifiant UC….
export function parseChannelInput(input: string): { id?: string; forHandle?: string; forUsername?: string } | null {
  const text = input.trim();
  if (!text) return null;
  if (/^UC[\w-]{20,}$/.test(text)) return { id: text };
  if (text.startsWith("@")) return { forHandle: text };
  let path = text;
  try {
    path = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`).pathname;
  } catch {
    return null;
  }
  const handle = /\/(@[^/]+)/.exec(path);
  if (handle) return { forHandle: decodeURIComponent(handle[1]) };
  const channel = /\/channel\/(UC[\w-]+)/.exec(path);
  if (channel) return { id: channel[1] };
  const user = /\/user\/([^/]+)/.exec(path);
  if (user) return { forUsername: decodeURIComponent(user[1]) };
  return null;
}

export interface YouTubeChannel {
  id: string;
  title: string;
  uploadsPlaylist: string;
}

export async function resolveChannel(input: string): Promise<YouTubeChannel> {
  const parsed = parseChannelInput(input);
  if (!parsed) throw new YouTubeError("Adresse de chaîne non reconnue : colle l'adresse de ta chaîne, par exemple youtube.com/@mapodcast.");
  const data = await yt<{ items?: { id: string; snippet: { title: string }; contentDetails: { relatedPlaylists: { uploads: string } } }[] }>("channels", {
    part: "snippet,contentDetails",
    ...(parsed.id ? { id: parsed.id } : parsed.forHandle ? { forHandle: parsed.forHandle } : { forUsername: parsed.forUsername! }),
  });
  const channel = data.items?.[0];
  if (!channel) throw new YouTubeError("Chaîne introuvable : vérifie l'adresse.");
  return { id: channel.id, title: channel.snippet.title, uploadsPlaylist: channel.contentDetails.relatedPlaylists.uploads };
}

export interface YouTubeVideo {
  videoId: string;
  title: string;
  publishedAt: string;
}

// Les vidéos les plus récentes de la chaîne (playlist « uploads »), 50 par page.
export async function listUploads(playlistId: string, max = 150): Promise<YouTubeVideo[]> {
  const videos: YouTubeVideo[] = [];
  let pageToken: string | undefined;
  while (videos.length < max) {
    const data = await yt<{
      items?: { snippet: { title: string; resourceId: { videoId: string } }; contentDetails?: { videoPublishedAt?: string } }[];
      nextPageToken?: string;
    }>("playlistItems", { part: "snippet,contentDetails", playlistId, maxResults: "50", ...(pageToken ? { pageToken } : {}) });
    for (const item of data.items ?? []) {
      videos.push({ videoId: item.snippet.resourceId.videoId, title: item.snippet.title, publishedAt: item.contentDetails?.videoPublishedAt ?? "" });
    }
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return videos;
}

export interface VideoStats {
  title: string;
  views: number;
  likes: number | null;
  comments: number | null;
}

// Statistiques actuelles (totaux) d'une liste de vidéos, par paquets de 50.
export async function fetchVideoStats(videoIds: string[]): Promise<Map<string, VideoStats>> {
  const result = new Map<string, VideoStats>();
  for (let i = 0; i < videoIds.length; i += 50) {
    const chunk = videoIds.slice(i, i + 50);
    const data = await yt<{
      items?: { id: string; snippet: { title: string }; statistics: { viewCount?: string; likeCount?: string; commentCount?: string } }[];
    }>("videos", { part: "snippet,statistics", id: chunk.join(",") });
    for (const item of data.items ?? []) {
      result.set(item.id, {
        title: item.snippet.title,
        views: Number(item.statistics.viewCount ?? 0),
        likes: item.statistics.likeCount !== undefined ? Number(item.statistics.likeCount) : null,
        comments: item.statistics.commentCount !== undefined ? Number(item.statistics.commentCount) : null,
      });
    }
  }
  return result;
}

const STOP_WORDS = new Set(["le", "la", "les", "de", "du", "des", "un", "une", "et", "a", "en", "the", "of", "ou", "au", "aux"]);

function tokens(text: string): Set<string> {
  return new Set(
    text
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((t) => t && !STOP_WORDS.has(t))
  );
}

// Retrouve la vidéo d'un épisode par son titre : les mots du titre de l'épisode doivent se retrouver
// dans celui de la vidéo (ou l'inverse). À égalité, la vidéo publiée le plus près de la date de sortie gagne.
export function matchVideo(episodeTitle: string, releaseDate: Date | null, videos: YouTubeVideo[]): YouTubeVideo | null {
  const wanted = tokens(episodeTitle);
  if (wanted.size === 0) return null;
  let best: { video: YouTubeVideo; score: number; distance: number } | null = null;
  for (const video of videos) {
    const have = tokens(video.title);
    if (have.size === 0) continue;
    const shared = [...wanted].filter((t) => have.has(t)).length;
    const score = Math.max(shared / wanted.size, shared / have.size);
    if (score < 0.6 || (wanted.size === 1 && shared === 0)) continue;
    const distance = releaseDate && video.publishedAt ? Math.abs(new Date(video.publishedAt).getTime() - releaseDate.getTime()) : Number.MAX_SAFE_INTEGER;
    if (!best || score > best.score || (score === best.score && distance < best.distance)) best = { video, score, distance };
  }
  return best?.video ?? null;
}
