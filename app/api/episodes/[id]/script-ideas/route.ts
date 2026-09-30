import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@/app/generated/prisma/client";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";
import { jsonResponse } from "@/lib/json";
import { episodeLabel } from "@/lib/episode";
import { generateScriptIdeas } from "@/lib/pipeline/scriptIdeas";
import { assertModuleAccess, ModuleLockedError } from "@/lib/entitlements";
import { z } from "zod";

const bodySchema = z.object({ draftNotes: z.string().optional() });

// Module "Script" : génère des idées d'angles/thèmes pour cet épisode à
// partir de la bible du podcast, de ses invités déjà ajoutés (s'il y en a)
// et, si fourni, du brouillon en cours d'écriture ("Générer des angles à
// partir des idées" prend alors le texte saisi comme point de départ).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId } = await params;
  const episode = await requireOwnedEpisode(userId, episodeId);
  try {
    await assertModuleAccess(userId, "script");
  } catch (err) {
    if (err instanceof ModuleLockedError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  const draftNotes = parsed.success ? parsed.data.draftNotes : undefined;

  const podcast = await prisma.podcast.findUnique({ where: { id: episode.podcastId }, select: { bible: true } });
  if (!podcast?.bible) {
    return NextResponse.json(
      { error: "Complète d'abord la bible de ton podcast dans l'onglet ADN de Mon podcast." },
      { status: 400 }
    );
  }

  const episodeGuests = await prisma.episodeGuest.findMany({
    where: { episodeId },
    include: { guest: { select: { name: true, mediaName: true } } },
    orderBy: { order: "asc" },
  });

  let ideas: string[];
  try {
    ideas = await generateScriptIdeas({
      episodeLabel: episodeLabel(episode),
      bible: podcast.bible,
      guestDescriptions: episodeGuests.map((eg) =>
        eg.guest.mediaName ? `${eg.guest.name} (${eg.guest.mediaName})` : eg.guest.name
      ),
      draftNotes,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }

  const updated = await prisma.episode.update({
    where: { id: episodeId },
    data: { scriptAngleIdeas: ideas as unknown as Prisma.InputJsonValue, scriptIdeasGeneratedAt: new Date() },
  });

  return jsonResponse(updated);
}
