import { prisma } from "@/lib/db";
import { fetchVideoStats } from "@/lib/youtube";
import { todayInParis } from "@/lib/moduleProgress";

// Source des relevés d'un contenu annexe (la vidéo principale de l'épisode a la source « YOUTUBE »).
export const relatedSource = (videoId: string) => `RELATED:${videoId}`;

// Enregistre le relevé du jour (totaux YouTube) pour les épisodes qui ont une vidéo rattachée.
// Un relevé par épisode et par jour : le relancer le même jour met simplement à jour le chiffre.
export async function snapshotYoutubeStats(episodes: { id: string; youtubeVideoId: string | null }[]): Promise<number> {
  const linked = episodes.filter((e): e is { id: string; youtubeVideoId: string } => !!e.youtubeVideoId);
  // Les contenus annexes de ces épisodes (shorts extraits...) sont mis à jour en même temps.
  const related = await prisma.relatedContent.findMany({ where: { episodeId: { in: episodes.map((e) => e.id) } }, select: { id: true, episodeId: true, videoId: true } });
  if (linked.length === 0 && related.length === 0) return 0;
  const stats = await fetchVideoStats([...new Set([...linked.map((e) => e.youtubeVideoId), ...related.map((r) => r.videoId)])]);
  const day = new Date(todayInParis());
  for (const item of related) {
    const s = stats.get(item.videoId);
    if (!s) continue;
    await prisma.relatedContent.update({ where: { id: item.id }, data: { title: s.title, views: s.views, likes: s.likes, comments: s.comments } });
    // Historique des contenus annexes : un relevé par jour aussi, sous la source « RELATED:<vidéo> ».
    await prisma.statSnapshot.upsert({
      where: { episodeId_source_day: { episodeId: item.episodeId, source: relatedSource(item.videoId), day } },
      update: { views: s.views, likes: s.likes, comments: s.comments },
      create: { episodeId: item.episodeId, source: relatedSource(item.videoId), day, views: s.views, likes: s.likes, comments: s.comments },
    });
  }
  let written = 0;
  for (const episode of linked) {
    const s = stats.get(episode.youtubeVideoId);
    if (!s) continue;
    await prisma.statSnapshot.upsert({
      where: { episodeId_source_day: { episodeId: episode.id, source: "YOUTUBE", day } },
      update: { views: s.views, likes: s.likes, comments: s.comments },
      create: { episodeId: episode.id, source: "YOUTUBE", day, views: s.views, likes: s.likes, comments: s.comments },
    });
    await prisma.episode.update({ where: { id: episode.id }, data: { youtubeVideoTitle: s.title } });
    written += 1;
  }
  return written;
}

interface SnapshotRow {
  episodeId: string;
  source: string;
  day: Date;
  views: number;
}

// Vues YouTube gagnées pendant le mois, tous épisodes confondus : dernier total moins le total à la
// fin du mois précédent. Sans relevé avant le mois, une vidéo d'un épisode sorti ce mois-ci compte toutes
// ses vues ; celle d'un épisode plus ancien compte seulement ce qui a été gagné depuis le premier relevé.
export function viewsGainedSince(
  snapshots: SnapshotRow[],
  publishedAt: Map<string, Date>,
  monthStart: Date
): number | null {
  // Une série par vidéo suivie : la vidéo principale d'un épisode, ou chacun de ses contenus annexes.
  const bySeries = new Map<string, SnapshotRow[]>();
  for (const s of snapshots) bySeries.set(`${s.episodeId}|${s.source}`, [...(bySeries.get(`${s.episodeId}|${s.source}`) ?? []), s]);
  if (bySeries.size === 0) return null;
  let total = 0;
  for (const rows of bySeries.values()) {
    const episodeId = rows[0].episodeId;
    const sorted = [...rows].sort((a, b) => a.day.getTime() - b.day.getTime());
    const latest = sorted[sorted.length - 1];
    const before = [...sorted].reverse().find((r) => r.day < monthStart);
    // Un contenu annexe (short extrait...) est publié après la sortie de son épisode : si l'épisode est sorti
    // ce mois-ci, l'annexe l'est aussi et compte toutes ses vues ce mois-ci.
    const published = publishedAt.get(episodeId);
    const baseline = before ? before.views : published && published >= monthStart ? 0 : sorted[0].views;
    total += Math.max(0, latest.views - baseline);
  }
  return total;
}

// Total de vues N jours après la sortie : le dernier relevé jusqu'à ce jour-là, à condition qu'il date
// d'au plus 7 jours avant (sinon le chiffre serait trop ancien). Renvoie null si le jour n'est pas
// encore atteint ou si aucun relevé ne tombe dans cette fenêtre (les relevés ne remontent pas avant
// le branchement de la chaîne).
export function viewsAtDaysAfter(rows: { day: Date; views: number }[], releaseDate: Date, days: number, today: Date): number | null {
  const DAY = 86_400_000;
  const target = new Date(Date.UTC(releaseDate.getUTCFullYear(), releaseDate.getUTCMonth(), releaseDate.getUTCDate()) + days * DAY);
  if (target.getTime() > today.getTime()) return null;
  const inWindow = rows.filter((r) => r.day.getTime() <= target.getTime() && r.day.getTime() >= target.getTime() - 7 * DAY);
  if (inWindow.length === 0) return null;
  return inWindow.reduce((latest, r) => (r.day.getTime() > latest.day.getTime() ? r : latest)).views;
}
