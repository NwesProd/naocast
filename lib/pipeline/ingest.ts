import { prisma } from "@/lib/db";
import { putLocalFile } from "@/lib/storage";
import { getDurationSec } from "@/lib/pipeline/ffmpeg";
import type { RushSourceType } from "@/app/generated/prisma/client";

// Récupération des rushs vers le stockage temporaire. Un seul point d'entrée
// (fetchRush) quelle que soit la source ; chaque adaptateur ne connaît que le
// détail de son API. Étape 1 du pipeline : "Récupération des rushs vers le
// stockage temporaire".
//
// Seul l'upload direct est pleinement fonctionnel dans ce scaffold, Smash,
// Google Drive et Dropbox nécessitent des identifiants d'API (app enregistrée
// côté Smash, credentials OAuth côté Google/Dropbox) que ce scaffold ne peut
// pas deviner. Les adaptateurs sont prêts : il suffit de remplir `fetchFrom*`
// une fois les identifiants obtenus. WeTransfer est explicitement hors scope
// (pas d'API de consommation fiable, cf. brief).

export interface FetchedRush {
  localPath: string;
  originalFilename: string;
}

async function fetchFromSmash(externalRef: string): Promise<FetchedRush> {
  throw new Error(
    `Intégration Smash non configurée (ref: ${externalRef}). ` +
      "Nécessite un token d'API Smash (SMASH_API_KEY), voir lib/pipeline/ingest.ts."
  );
}

async function fetchFromGoogleDrive(externalRef: string): Promise<FetchedRush> {
  throw new Error(
    `Intégration Google Drive non configurée (ref: ${externalRef}). ` +
      "Nécessite des identifiants OAuth Google (GOOGLE_CLIENT_ID/SECRET), voir lib/pipeline/ingest.ts."
  );
}

async function fetchFromDropbox(externalRef: string): Promise<FetchedRush> {
  throw new Error(
    `Intégration Dropbox non configurée (ref: ${externalRef}). ` +
      "Nécessite un token d'API Dropbox (DROPBOX_ACCESS_TOKEN), voir lib/pipeline/ingest.ts."
  );
}

// `_workDir` : répertoire de travail où les adaptateurs Smash/Drive/Dropbox
// téléchargeront le fichier une fois implémentés (non utilisé tant qu'ils sont stubbés).
export async function fetchRush(rushId: string, _workDir: string): Promise<void> {
  const rush = await prisma.rushSource.findUniqueOrThrow({ where: { id: rushId } });
  await prisma.rushSource.update({ where: { id: rushId }, data: { status: "FETCHING" } });

  try {
    let fetched: FetchedRush;
    const type = rush.type as RushSourceType;
    if (type === "UPLOAD") {
      // Déjà rapatrié au moment de l'upload direct (voir app/api/episodes/[id]/rushes/route.ts)
      await prisma.rushSource.update({ where: { id: rushId }, data: { status: "READY" } });
      return;
    }
    if (type === "SMASH") {
      fetched = await fetchFromSmash(rush.externalRef!);
    } else if (type === "GOOGLE_DRIVE") {
      fetched = await fetchFromGoogleDrive(rush.externalRef!);
    } else {
      fetched = await fetchFromDropbox(rush.externalRef!);
    }

    const storageKey = `rushes/${rush.episodeId}/${rush.id}-${fetched.originalFilename}`;
    await putLocalFile(storageKey, fetched.localPath);
    const durationSec = await getDurationSec(fetched.localPath);

    await prisma.rushSource.update({
      where: { id: rushId },
      data: { status: "READY", storageKey, originalFilename: fetched.originalFilename, durationSec },
    });
  } catch (err) {
    await prisma.rushSource.update({ where: { id: rushId }, data: { status: "FAILED" } });
    throw err;
  }
}
