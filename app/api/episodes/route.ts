import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId, requirePodcast, NoPodcastError } from "@/lib/authz";
import { assertCanCreateEpisode, PlanLimitError } from "@/lib/entitlements";

// Dashboard → "Ajouter un épisode" (étape 3 du parcours) et liste des épisodes.
// Impossible tant que le podcast n'est pas configuré (cf. requirePodcast) :
// le dashboard redirige déjà vers /podcast dans ce cas, ceci protège aussi
// l'API elle-même contre un appel direct.
export async function GET() {
  const userId = await requireUserId();
  try {
    const podcast = await requirePodcast(userId);
    const episodes = await prisma.episode.findMany({
      where: { podcastId: podcast.id },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(episodes);
  } catch (err) {
    if (err instanceof NoPodcastError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

export async function POST() {
  const userId = await requireUserId();
  try {
    const podcast = await requirePodcast(userId);
    await assertCanCreateEpisode(userId);
    const episode = await prisma.episode.create({ data: { podcastId: podcast.id } });
    return NextResponse.json(episode);
  } catch (err) {
    if (err instanceof NoPodcastError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof PlanLimitError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }
}
