import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@/app/generated/prisma/client";
import { requireUserId, requirePodcast } from "@/lib/authz";
import { jsonResponse } from "@/lib/json";
import { z } from "zod";
import { matchingTags, normalizeTags } from "@/lib/guestRelevance";

const socialLinkSchema = z.object({ platform: z.string().min(1), url: z.string().min(1) });

// Module "Invités" : le "pool" est la base d'invités déjà utilisés sur CE
// podcast (pas par épisode), un même invité, une fois créé, est proposable
// sur n'importe quel épisode suivant avec ses infos déjà pré-remplies.
// ?episodeId=... (optionnel) permet au client de savoir lesquels sont déjà
// rattachés à l'épisode en cours, pour ne pas ré-afficher un "+" dessus.
export async function GET(req: Request) {
  const userId = await requireUserId();
  const podcast = await requirePodcast(userId);

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() || null;
  const episodeId = searchParams.get("episodeId") || null;

  const guests = await prisma.guest.findMany({
    where: {
      podcastId: podcast.id,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { mediaName: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
    include: {
      episodeGuests: {
        include: { episode: { select: { id: true, releaseDate: true } } },
      },
    },
  });

  const attachedGuestIds = episodeId
    ? new Set(
        (
          await prisma.episodeGuest.findMany({ where: { episodeId }, select: { guestId: true } })
        ).map((eg) => eg.guestId)
      )
    : new Set<string>();

  // Script de l'épisode (brouillon + idées d'angles) : sert à repérer les invités
  // dont les mots clés sont pertinents, remontés en tête de liste.
  let scriptText = "";
  if (episodeId) {
    const episode = await prisma.episode.findFirst({
      where: { id: episodeId, podcastId: podcast.id },
      select: { scriptDraft: true, scriptAngleIdeas: true },
    });
    if (episode) {
      const ideas = Array.isArray(episode.scriptAngleIdeas) ? (episode.scriptAngleIdeas as unknown[]).filter((i) => typeof i === "string") : [];
      scriptText = [episode.scriptDraft ?? "", ...ideas].join("\n");
    }
  }

  const result = guests.map((g) => {
    // "Dernière apparition podcast" : la date de sortie de l'épisode le plus
    // récent où cet invité apparaît (repli sur la date de rattachement si
    // l'épisode n'a pas encore de date de sortie).
    const dates = g.episodeGuests.map((eg) => eg.episode.releaseDate ?? undefined).filter((d): d is Date => !!d);
    const lastAppearanceAt = dates.length > 0 ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null;
    return {
      id: g.id,
      name: g.name,
      mediaName: g.mediaName,
      socialLinks: (g.socialLinks as { platform: string; url: string }[] | null) ?? [],
      tags: g.tags,
      relevantTags: matchingTags(g.tags, scriptText),
      lastAppearanceAt,
      alreadyAdded: attachedGuestIds.has(g.id),
    };
  });

  // Les plus pertinents d'abord (plus de mots clés en commun avec le script), puis l'ordre alphabétique d'origine.
  result.sort((a, b) => b.relevantTags.length - a.relevantTags.length);

  return jsonResponse(result);
}

const createSchema = z.object({
  name: z.string().min(1).max(200),
  mediaName: z.string().max(200).nullable().optional(),
  socialLinks: z.array(socialLinkSchema).optional(),
  tags: z.array(z.string().max(40)).max(30).optional(),
  // Si fourni, l'invité créé est aussi immédiatement rattaché à cet épisode
  // (cas d'usage principal : "+ Ajouter un invité" depuis un épisode).
  episodeId: z.string().min(1).optional(),
});

export async function POST(req: Request) {
  const userId = await requireUserId();
  const podcast = await requirePodcast(userId);

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const { name, mediaName, socialLinks, tags, episodeId } = parsed.data;

  if (episodeId) {
    const episode = await prisma.episode.findUnique({ where: { id: episodeId }, select: { podcastId: true } });
    if (!episode || episode.podcastId !== podcast.id) {
      return NextResponse.json({ error: "Épisode introuvable." }, { status: 404 });
    }
  }

  const guest = await prisma.guest.create({
    data: {
      podcastId: podcast.id,
      name,
      mediaName: mediaName || null,
      socialLinks: (socialLinks ?? []) as unknown as Prisma.InputJsonValue,
      tags: normalizeTags(tags ?? []),
    },
  });

  if (episodeId) {
    const maxOrder = await prisma.episodeGuest.aggregate({ where: { episodeId }, _max: { order: true } });
    await prisma.episodeGuest.create({
      data: { episodeId, guestId: guest.id, order: (maxOrder._max.order ?? -1) + 1 },
    });
  }

  return jsonResponse(guest, { status: 201 });
}
