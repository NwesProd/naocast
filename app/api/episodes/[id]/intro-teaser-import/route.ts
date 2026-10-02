import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { mkdtemp, rm } from "fs/promises";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { tmpdir } from "os";
import path from "path";
import { prisma } from "@/lib/db";
import { jsonResponse } from "@/lib/json";
import { putLocalFile, deleteObject } from "@/lib/storage";
import { parseMultipart } from "@/lib/parseMultipart";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";

// Étape "Intro" du tunnel : alternative au module (cf. app/(app)/episodes/[id]/intro)
//, un fichier déjà prêt, importé directement comme teaser diffusé avant le
// générique de début (court-circuite la construction/validation dans le module).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId } = await params;
  await requireOwnedEpisode(userId, episodeId);

  const tmpDir = await mkdtemp(path.join(tmpdir(), "podtool-intro-teaser-import-"));
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

    const storageKey = `episodes/${episodeId}/intro-teaser-import/${randomUUID()}-${originalFilename}`;
    await putLocalFile(storageKey, tmpPath);
    const previousKey = (await prisma.episode.findUnique({ where: { id: episodeId }, select: { introTeaserImportKey: true } }))?.introTeaserImportKey;

    const episode = await prisma.episode.update({
      where: { id: episodeId },
      data: { introTeaserImportKey: storageKey, introTeaserChoice: "IMPORT" },
    });
    // Le fichier remplacé ne sert plus : on le supprime du stockage.
    if (previousKey && previousKey !== storageKey) await deleteObject(previousKey).catch(() => {});
    return jsonResponse(episode);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}
