import { NextResponse } from "next/server";
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

// Étape "1. Monteur" → "J'ai déjà un monteur" → "J'importe l'épisode validé
// sur naocast." (et le même geste depuis l'écran "Envoyé à votre monteur" une
// fois le montage reçu, cf. ReviewClient) : l'épisode a été monté entièrement
// en dehors de naocast. (par un monteur externe) ; on importe directement le
// rendu final, sans passer par le pipeline automatique (pas de rushs, pas
// d'autocut, pas de générique/logo incrustés par naocast., tout est déjà dans
// le fichier fourni).
//
// Le fichier étant déjà un montage validé, aucune retouche n'a de sens ici
// (pas de "Recouper un passage" à proposer) : on enchaîne directement sur
// l'export audio (comme /validate) plutôt que de s'arrêter en relecture, pour
// arriver aux boutons finaux (vidéo + audio) sans étape intermédiaire.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId } = await params;
  await requireOwnedEpisode(userId, episodeId);

  const tmpDir = await mkdtemp(path.join(tmpdir(), "podtool-import-edited-"));
  let tmpPath: string | null = null;

  try {
    await parseMultipart(req, async (file) => {
      if (file.fieldName !== "file" || !file.filename) {
        file.stream.resume();
        return;
      }
      tmpPath = path.join(tmpDir, file.filename);
      await pipeline(file.stream, createWriteStream(tmpPath));
    });

    if (!tmpPath) {
      return NextResponse.json({ error: "Fichier manquant." }, { status: 400 });
    }

    const storageKey = `episodes/${episodeId}/final.mp4`;
    await putLocalFile(storageKey, tmpPath, "video/mp4");

    const maxSeq = await prisma.processingJob.aggregate({ where: { episodeId }, _max: { sequence: true } });
    const sequence = (maxSeq._max.sequence ?? -1) + 1;

    const [, , , episode] = await prisma.$transaction([
      prisma.exportAsset.deleteMany({ where: { episodeId, type: "VIDEO" } }),
      prisma.exportAsset.create({ data: { episodeId, type: "VIDEO", storageKey } }),
      prisma.processingJob.create({ data: { episodeId, type: "EXPORT_AUDIO", sequence } }),
      prisma.episode.update({
        where: { id: episodeId },
        data: { editorChoice: "HAS_EDITOR_IMPORT", status: "QUEUED" },
      }),
    ]);
    return jsonResponse(episode);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}
