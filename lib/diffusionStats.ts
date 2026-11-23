import { prisma } from "@/lib/db";
import { fetchVideoStats } from "@/lib/youtube";
import { todayInParis } from "@/lib/moduleProgress";

// Enregistre le relevé du jour (totaux YouTube) pour les épisodes qui ont une vidéo rattachée.
// Un relevé par épisode et par jour : le relancer le même jour met simplement à jour le chiffre.
export async function snapshotYoutubeStats(episodes: { id: string; youtubeVideoId: string | null }[]): Promise<number> {
  const linked = episodes.filter((e): e is { id: string; youtubeVideoId: string } => !!e.youtubeVideoId);
  if (linked.length === 0) return 0;
  const stats = await fetchVideoStats([...new Set(linked.map((e) => e.youtubeVideoId))]);
  const day = new Date(todayInParis());
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
  day: Date;
  views: number;
}

// Vues YouTube gagnées pendant le mois, tous épisodes confondus : dernier total moins le total à la
// fin du mois précédent. Sans relevé avant le mois, un épisode sorti ce mois-ci compte toutes ses
// vues ; un plus ancien compte seulement ce qui a été gagné depuis le premier relevé.
export function viewsGainedSince(
  snapshots: SnapshotRow[],
  publishedAt: Map<string, Date>,
  monthStart: Date
): number | null {
  const byEpisode = new Map<string, SnapshotRow[]>();
  for (const s of snapshots) byEpisode.set(s.episodeId, [...(byEpisode.get(s.episodeId) ?? []), s]);
  if (byEpisode.size === 0) return null;
  let total = 0;
  for (const [episodeId, rows] of byEpisode) {
    const sorted = [...rows].sort((a, b) => a.day.getTime() - b.day.getTime());
    const latest = sorted[sorted.length - 1];
    const before = [...sorted].reverse().find((r) => r.day < monthStart);
    const published = publishedAt.get(episodeId);
    const baseline = before ? before.views : published && published >= monthStart ? 0 : sorted[0].views;
    total += Math.max(0, latest.views - baseline);
  }
  return total;
}
