import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";
import { jsonResponse } from "@/lib/json";
import { episodeLabel } from "@/lib/episode";
import { generateGuestMessage } from "@/lib/pipeline/guestMessage";
import { assertModuleAccess, ModuleLockedError } from "@/lib/entitlements";
import { z } from "zod";

// Enregistre une modification manuelle du message (copier/éditer), la
// génération elle-même se fait via POST ci-dessous.
const patchSchema = z.object({ guestMessage: z.string() });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId } = await params;
  await requireOwnedEpisode(userId, episodeId);

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  const episode = await prisma.episode.update({
    where: { id: episodeId },
    data: { guestMessage: parsed.data.guestMessage || null },
  });

  return jsonResponse(episode);
}

// Génère directement le message via l'API Claude à partir de ce qu'on
// connaît déjà (podcast, épisode, invités), pas d'infos à saisir en amont,
// cf. lib/pipeline/guestMessage.ts pour les [à compléter] laissés pour le reste.
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

  const episode = await prisma.episode.findUnique({
    where: { id: episodeId },
    include: { podcast: { select: { title: true } } },
  });
  if (!episode) return NextResponse.json({ error: "Épisode introuvable." }, { status: 404 });

  const episodeGuests = await prisma.episodeGuest.findMany({
    where: { episodeId },
    include: { guest: { select: { name: true } } },
    orderBy: { order: "asc" },
  });

  let message: string;
  try {
    message = await generateGuestMessage({
      podcastTitle: episode.podcast.title,
      episodeLabel: episodeLabel(episode),
      guestNames: episodeGuests.map((eg) => eg.guest.name),
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }

  const updated = await prisma.episode.update({
    where: { id: episodeId },
    data: { guestMessage: message, guestMessageGeneratedAt: new Date() },
  });

  return jsonResponse(updated);
}
