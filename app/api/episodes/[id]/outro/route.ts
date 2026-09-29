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

// Étape "Générique de fin" du tunnel : symétrique de /intro (cf. ce fichier).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId } = await params;
  await requireOwnedEpisode(userId, episodeId);

  const tmpDir = await mkdtemp(path.join(tmpdir(), "podtool-episode-outro-"));
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

    const storageKey = `episodes/${episodeId}/outro/${randomUUID()}-${originalFilename}`;
    await putLocalFile(storageKey, tmpPath);

    const episode = await prisma.episode.update({
      where: { id: episodeId },
      data: { outroSource: "EPISODE", outroKey: storageKey },
    });
    return jsonResponse(episode);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}
