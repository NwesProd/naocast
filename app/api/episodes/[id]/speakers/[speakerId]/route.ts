import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";
import { jsonResponse } from "@/lib/json";
import { z } from "zod";

// Renomme un locuteur détecté par la diarization (ex. "SPEAKER_00" →
// "Animateur"), la reconnaissance vocale ne fournit qu'un label anonyme,
// l'utilisateur associe le nom après lecture du transcript (étape "Cut" du
// tunnel de montage).
const patchSchema = z.object({
  displayName: z.string().max(100).nullable(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; speakerId: string }> }
) {
  const userId = await requireUserId();
  const { id: episodeId, speakerId } = await params;
  await requireOwnedEpisode(userId, episodeId);

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  const speaker = await prisma.episodeSpeaker.update({
    where: { id: speakerId, episodeId },
    data: { displayName: parsed.data.displayName },
  });
  return jsonResponse(speaker);
}

// Retire un locuteur : ses prises de parole redeviennent sans locuteur.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; speakerId: string }> }
) {
  const userId = await requireUserId();
  const { id: episodeId, speakerId } = await params;
  await requireOwnedEpisode(userId, episodeId);

  const speaker = await prisma.episodeSpeaker.findFirst({ where: { id: speakerId, episodeId } });
  if (!speaker) return NextResponse.json({ error: "Locuteur introuvable." }, { status: 404 });

  await prisma.$transaction([
    prisma.transcriptSegment.updateMany({ where: { episodeId, speaker: speaker.label }, data: { speaker: null } }),
    prisma.episodeSpeaker.delete({ where: { id: speakerId } }),
  ]);
  return NextResponse.json({ ok: true });
}
