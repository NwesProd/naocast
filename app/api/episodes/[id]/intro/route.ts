import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { mkdtemp, rm } from "fs/promises";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { tmpdir } from "os";
import path from "path";
import { prisma } from "@/lib/db";
import { jsonResponse } from "@/lib/json";
import { putLocalFile } from "@/lib/storage";
import { parseMultipart } from "@/lib/parseMultipart";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";

// Étape "Générique de début" du tunnel : générique spécifique à cet épisode
// (remplace celui de la config podcast pour ce seul épisode, cf.
// Episode.introSource/introKey et lib/pipeline/render.ts).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId } = await params;
  await requireOwnedEpisode(userId, episodeId);

  const tmpDir = await mkdtemp(path.join(tmpdir(), "podtool-episode-intro-"));
  let originalFilename: string | null = null;
  let tmpPath: string | null = null;

  try {
    await parseMultipart(req, async (file) => {
      if (file.fieldName !== "file" || !file.filename) {
        file.stream.resume();
        return;
      }
      originalFilename = file.filename;
      tmpPath = path.join(tmpDir, file.filename);
      await pipeline(file.stream, createWriteStream(tmpPath));
    });

    if (!tmpPath || !originalFilename) {
      return NextResponse.json({ error: "Fichier manquant." }, { status: 400 });
    }

    const storageKey = `episodes/${episodeId}/intro/${randomUUID()}-${originalFilename}`;
    await putLocalFile(storageKey, tmpPath);

    const episode = await prisma.episode.update({
      where: { id: episodeId },
      data: { introSource: "EPISODE", introKey: storageKey },
    });
    return jsonResponse(episode);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}
