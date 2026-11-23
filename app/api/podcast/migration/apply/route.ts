import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/authz";
import { fetchFeed } from "@/lib/feedImport";
import { ensureRssSlug } from "@/lib/rss";
import { putObject } from "@/lib/storage";
import { safeFetch } from "@/lib/safeFetch";
import { randomUUID } from "crypto";

const schema = z.object({
  feedUrl: z.string().url(),
  // episodeId : un épisode naocast existant, "new" pour en créer un, null pour ne pas importer.
  choices: z.array(z.object({ guid: z.string(), episodeId: z.string().nullable() })).max(2000),
});

// Migration : applique le rapprochement. Rattache l'identifiant (GUID) de l'ancien flux à chaque épisode, crée
// les épisodes manquants, reprend les infos du podcast encore vides, puis lance la copie des fichiers audio.
export async function POST(req: Request) {
  const userId = await requireUserId();
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const podcast = await prisma.podcast.findUnique({ where: { userId } });
  if (!podcast) return NextResponse.json({ error: "Crée d'abord ton podcast." }, { status: 404 });

  let feed;
  try {
    feed = await fetchFeed(parsed.data.feedUrl);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 422 });
  }
  const byGuid = new Map(feed.items.map((i) => [i.guid, i]));
  const own = new Set((await prisma.episode.findMany({ where: { podcastId: podcast.id }, select: { id: true } })).map((e) => e.id));
  const used = new Set<string>();

  let imported = 0;
  for (const choice of parsed.data.choices) {
    const item = byGuid.get(choice.guid);
    if (!item || !choice.episodeId) continue;
    let episodeId = choice.episodeId;
    if (episodeId === "new") {
      const created = await prisma.episode.create({
        data: {
          podcastId: podcast.id,
          title: item.title,
          season: item.season,
          episodeNumber: item.episode,
          releaseDate: item.pubDate,
          status: "EXPORTED",
        },
      });
      episodeId = created.id;
    } else if (!own.has(episodeId) || used.has(episodeId)) {
      continue;
    }
    used.add(episodeId);

    const episode = await prisma.episode.findUniqueOrThrow({ where: { id: episodeId } });
    const hasAudio = await prisma.exportAsset.findFirst({ where: { episodeId, type: "AUDIO" }, select: { id: true } });
    await prisma.episode.update({
      where: { id: episodeId },
      data: {
        rssGuid: item.guid,
        // Titre tel qu'il est publié chez l'ancien hébergeur, s'il diffère de celui de l'épisode.
        audioTitle: (episode.title ?? "").trim() !== item.title.trim() ? item.title : episode.audioTitle,
        description: episode.description || item.description,
        releaseDate: episode.releaseDate ?? item.pubDate,
        season: episode.season ?? item.season,
        episodeNumber: episode.episodeNumber ?? item.episode,
        // Déjà publié chez l'ancien hébergeur : il entre dans le flux naocast avec sa date d'origine (il n'y paraît
        // qu'une fois son audio copié).
        audioPublishedAt: item.pubDate ?? new Date(),
        importAudioUrl: hasAudio ? null : item.audioUrl,
      },
    });
    if (!hasAudio) {
      const max = await prisma.processingJob.aggregate({ where: { episodeId }, _max: { sequence: true } });
      await prisma.processingJob.deleteMany({ where: { episodeId, type: "IMPORT_AUDIO" } });
      await prisma.processingJob.create({ data: { episodeId, type: "IMPORT_AUDIO", sequence: (max._max.sequence ?? -1) + 1 } });
    }
    imported += 1;
  }

  // Infos du podcast : on reprend celles de l'ancien flux, sans écraser ce qui est déjà rempli.
  const c = feed.channel;
  let coverKey = podcast.coverKey;
  if (!coverKey && c.imageUrl) {
    try {
      const res = await safeFetch(c.imageUrl);
      if (res.ok) {
        const type = res.headers.get("content-type") || "image/jpeg";
        const ext = type.includes("png") ? "png" : "jpg";
        coverKey = `podcast/cover/${randomUUID()}-pochette.${ext}`;
        await putObject(coverKey, Buffer.from(await res.arrayBuffer()), type);
      }
    } catch {
      coverKey = podcast.coverKey;
    }
  }
  await prisma.podcast.update({
    where: { id: podcast.id },
    data: {
      hostingMode: "MIGRATE",
      migrationFeedUrl: parsed.data.feedUrl,
      migrationStatus: "IMPORTING",
      coverKey,
      author: podcast.author || c.author,
      ownerEmail: podcast.ownerEmail || c.ownerEmail,
      description: podcast.description || c.description,
      category: podcast.category || c.category,
      website: podcast.website || (c.link && /^https?:\/\//.test(c.link) ? c.link : null),
      explicit: podcast.explicit || c.explicit,
    },
  });
  await ensureRssSlug(podcast.id, podcast.title);
  return NextResponse.json({ ok: true, imported });
}
