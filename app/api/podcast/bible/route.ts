import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getObjectBuffer } from "@/lib/storage";
import { requireUserId } from "@/lib/authz";
import { jsonResponse } from "@/lib/json";
import { generatePodcastBible } from "@/lib/pipeline/podcastBible";
import { z } from "zod";

interface ReferenceFile {
  key: string;
  filename: string;
  mimeType: string;
}

// Génère la bible du podcast (API Claude) à partir de l'ADN et des documents
// de référence déjà enregistrés (cf. POST /api/podcast/dna), rien à
// transmettre dans le corps de la requête, tout est déjà en base.
export async function POST() {
  const userId = await requireUserId();
  const podcast = await prisma.podcast.findUnique({ where: { userId } });
  if (!podcast) return NextResponse.json({ error: "Configurez d'abord le podcast." }, { status: 400 });

  const referenceFiles = (podcast.referenceFiles as ReferenceFile[] | null) ?? [];

  let bible: string;
  try {
    bible = await generatePodcastBible({
      title: podcast.title,
      dna: podcast.dna,
      referenceFiles: await Promise.all(
        referenceFiles.map(async (f) => ({
          filename: f.filename,
          mimeType: f.mimeType,
          buffer: await getObjectBuffer(f.key),
        }))
      ),
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }

  const updated = await prisma.podcast.update({
    where: { userId },
    data: { bible, bibleGeneratedAt: new Date() },
  });

  return jsonResponse(updated);
}

const patchSchema = z.object({ bible: z.string() });

// Enregistre une modification manuelle de la bible générée.
export async function PATCH(req: Request) {
  const userId = await requireUserId();
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  const podcast = await prisma.podcast.update({
    where: { userId },
    data: { bible: parsed.data.bible || null },
  });

  return jsonResponse(podcast);
}
