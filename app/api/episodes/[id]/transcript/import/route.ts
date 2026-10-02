import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";
import { MAX_TRANSCRIPT_CHARS, parseTranscript } from "@/lib/transcriptImport";

const schema = z.object({ text: z.string().min(1).max(MAX_TRANSCRIPT_CHARS) });

// Import d'un transcript fait en dehors de naocast (texte collé ou fichier
// .txt/.srt/.vtt lu côté navigateur) : remplace le transcript de l'épisode, ce
// qui allume aussi le tick vert du module Transcript. Pour qui gère son
// montage hors naocast et n'a donc pas de rush à faire transcrire ici.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId } = await params;
  await requireOwnedEpisode(userId, episodeId);

  const parsedBody = schema.safeParse(await req.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Transcript vide ou trop volumineux (1 million de caractères maximum)." }, { status: 400 });
  }

  const { segments, speakers } = parseTranscript(parsedBody.data.text);
  if (segments.length === 0) {
    return NextResponse.json({ error: "Aucun texte exploitable dans ce transcript." }, { status: 400 });
  }

  // Par lots : un seul createMany de plusieurs milliers de lignes dépasserait
  // la limite de paramètres d'une requête Postgres.
  const BATCH = 1000;
  const batches = [];
  for (let i = 0; i < segments.length; i += BATCH) {
    batches.push(
      prisma.transcriptSegment.createMany({
        data: segments.slice(i, i + BATCH).map((s) => ({ episodeId, ...s })),
      })
    );
  }

  await prisma.$transaction([
    prisma.transcriptSegment.deleteMany({ where: { episodeId } }),
    prisma.episodeSpeaker.deleteMany({ where: { episodeId } }),
    ...batches,
    prisma.episodeSpeaker.createMany({ data: speakers.map((sp) => ({ episodeId, label: sp.label, displayName: sp.displayName })) }),
  ]);

  return NextResponse.json({ ok: true, segments: segments.length, speakers: speakers.length });
}
