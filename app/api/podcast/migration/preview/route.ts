import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/authz";
import { fetchFeed, matchEpisodes } from "@/lib/feedImport";

// Migration : lit l'ancien flux RSS et propose, pour chaque épisode, l'épisode naocast correspondant.
export async function POST(req: Request) {
  const userId = await requireUserId();
  const parsed = z.object({ feedUrl: z.string().url() }).safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Colle l'adresse complète de ton flux (https://...)." }, { status: 400 });
  const podcast = await prisma.podcast.findUnique({ where: { userId } });
  if (!podcast) return NextResponse.json({ error: "Crée d'abord ton podcast." }, { status: 404 });

  let feed;
  try {
    feed = await fetchFeed(parsed.data.feedUrl);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 422 });
  }
  if (feed.items.length === 0) return NextResponse.json({ error: "Aucun épisode trouvé dans ce flux." }, { status: 422 });

  const existing = await prisma.episode.findMany({
    where: { podcastId: podcast.id },
    select: { id: true, title: true, season: true, episodeNumber: true, releaseDate: true },
    orderBy: { createdAt: "asc" },
  });
  const matches = matchEpisodes(feed.items, existing);
  return NextResponse.json({
    channel: { title: feed.channel.title, author: feed.channel.author },
    items: feed.items.map((it, i) => ({
      guid: it.guid,
      title: it.title,
      pubDate: it.pubDate?.toISOString() ?? null,
      sizeBytes: it.sizeBytes,
      episodeId: matches[i].episodeId,
      confidence: matches[i].confidence,
    })),
    episodes: existing.map((e) => ({
      id: e.id,
      title: e.title || "Sans titre",
      code: [e.season != null ? `S${e.season}` : null, e.episodeNumber != null ? `E${e.episodeNumber}` : null].filter(Boolean).join(""),
    })),
  });
}
