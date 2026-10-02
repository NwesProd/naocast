import { NextResponse } from "next/server";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";
import { resetEpisodeWorkDir } from "@/lib/pipeline/render";
import { resetEpisodeToScratch } from "@/lib/pipeline/cleanup";

// Bouton "Recommencer le montage à zéro" en relecture : contrairement à
// /retry (qui relance le MÊME pipeline automatique après un échec), celui-ci
// repart du tout début du tunnel de montage : l'utilisateur réimporte ses
// rushs (supprimés ici, cf. resetEpisodeToScratch, pour ne pas garder sur le
// stockage des fichiers qu'il remplacera), puis revoit ses choix.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId } = await params;
  const episode = await requireOwnedEpisode(userId, episodeId);

  // Un épisode exporté est définitivement figé : sans ce verrou, un compte
  // au forfait gratuit (1 épisode) pourrait recommencer indéfiniment le même
  // épisode avec des rushs différents pour contourner la limite.
  if (episode.status === "EXPORTED") {
    return NextResponse.json({ error: "Cet épisode a déjà été exporté et ne peut plus être modifié." }, { status: 403 });
  }

  await resetEpisodeWorkDir(episodeId);
  await resetEpisodeToScratch(episodeId);

  return NextResponse.json({ ok: true });
}
