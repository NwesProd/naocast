import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";
import { jsonResponse } from "@/lib/json";
import { episodeLabel } from "@/lib/episode";
import { generateBroadcastMessage } from "@/lib/pipeline/guestMessage";
import { assertModuleAccess, ModuleLockedError } from "@/lib/entitlements";

// "Message diffusion" du module Invités : annonce de la sortie de l'épisode aux
// invités et consignes pour le relayer. Même fonctionnement que guest-message.
const patchSchema = z.object({ guestBroadcastMessage: z.string() });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId } = await params;
  await requireOwnedEpisode(userId, episodeId);

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  const episode = await prisma.episode.update({
    where: { id: episodeId },
    data: { guestBroadcastMessage: parsed.data.guestBroadcastMessage || null },
  });
  return jsonResponse(episode);
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId } = await params;
  await requireOwnedEpisode(userId, episodeId);
  try {
    await assertModuleAccess(userId, "invites");
  } catch (err) {
    if (err instanceof ModuleLockedError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const episode = await prisma.episode.findUnique({ where: { id: episodeId }, include: { podcast: { select: { title: true } } } });
  if (!episode) return NextResponse.json({ error: "Épisode introuvable." }, { status: 404 });

  const episodeGuests = await prisma.episodeGuest.findMany({
    where: { episodeId },
    include: { guest: { select: { name: true } } },
    orderBy: { order: "asc" },
  });

  let message: string;
  try {
    message = await generateBroadcastMessage({
      podcastTitle: episode.podcast.title,
      episodeLabel: episodeLabel(episode),
      guestNames: episodeGuests.map((eg) => eg.guest.name),
      releaseDateLabel: episode.releaseDate
        ? episode.releaseDate.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
        : null,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }

  const updated = await prisma.episode.update({
    where: { id: episodeId },
    data: { guestBroadcastMessage: message, guestBroadcastMessageGeneratedAt: new Date() },
  });
  return jsonResponse(updated);
}
