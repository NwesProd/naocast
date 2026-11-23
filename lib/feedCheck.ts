import sharp from "sharp";
import { prisma } from "@/lib/db";
import { getObjectBuffer, getObjectSize } from "@/lib/storage";

// Contrôle du flux d'un podcast avant de le soumettre à Apple Podcasts, Spotify et Deezer : les points qui font
// refuser un flux, ou qui gâchent son affichage.
export interface FeedCheckItem {
  level: "ok" | "warn" | "error";
  text: string;
}

export async function checkFeed(podcastId: string): Promise<{ items: FeedCheckItem[]; ready: boolean }> {
  const items: FeedCheckItem[] = [];
  const add = (level: FeedCheckItem["level"], text: string) => items.push({ level, text });
  const podcast = await prisma.podcast.findUniqueOrThrow({ where: { id: podcastId } });

  // Informations du podcast
  if (!podcast.author?.trim()) add("error", "L'auteur n'est pas renseigné.");
  else add("ok", "Auteur renseigné.");
  if (!podcast.ownerEmail?.trim()) add("error", "L'e-mail du propriétaire n'est pas renseigné (Apple et Spotify s'en servent pour te vérifier).");
  else add("ok", "E-mail du propriétaire renseigné.");
  if (!podcast.description?.trim()) add("error", "La description du podcast est vide.");
  else if (podcast.description.trim().length < 40) add("warn", "La description du podcast est très courte : elle aide pourtant à être trouvé.");
  else add("ok", "Description du podcast renseignée.");
  if (!podcast.category) add("error", "Aucune catégorie choisie.");
  else if (podcast.category === "Business") add("warn", "La catégorie Entreprise demande maintenant une sous-catégorie (entrepreneuriat, marketing...).");
  else add("ok", "Catégorie choisie.");

  // Pochette : carrée, 1400 à 3000 pixels
  if (!podcast.coverKey) {
    add("error", "Il manque la pochette du podcast (Bibliothèque de médias).");
  } else {
    try {
      const meta = await sharp(await getObjectBuffer(podcast.coverKey)).metadata();
      const w = meta.width ?? 0;
      const h = meta.height ?? 0;
      if (Math.abs(w - h) > 2) add("error", `La pochette fait ${w} x ${h} : elle doit être carrée.`);
      else if (w < 1400) add("error", `La pochette fait ${w} pixels de côté : Apple demande au moins 1400.`);
      else if (w > 3000) add("error", `La pochette fait ${w} pixels de côté : Apple accepte au plus 3000.`);
      else add("ok", `Pochette valide (${w} x ${h}).`);
    } catch {
      add("error", "La pochette n'a pas pu être lue : importe-la de nouveau.");
    }
  }

  // Épisodes publiés dans le flux
  const episodes = await prisma.episode.findMany({
    where: { podcastId, audioPublishedAt: { not: null, lte: new Date() } },
    include: { exports: { where: { type: "AUDIO" }, take: 1 } },
  });
  if (episodes.length === 0) {
    add("error", "Aucun épisode n'est publié dans le flux : publie-en au moins un (Diffusion d'un épisode, onglet Audio). Apple et Spotify refusent un flux vide.");
  } else {
    add("ok", `${episodes.length} épisode${episodes.length > 1 ? "s" : ""} dans le flux.`);
    let noAudio = 0;
    let noDescription = 0;
    for (const e of episodes) {
      const audio = e.exports[0];
      const size = audio ? await getObjectSize(audio.storageKey) : null;
      if (!audio || !size) noAudio += 1;
      if (!e.description?.trim()) noDescription += 1;
    }
    if (noAudio > 0) add("error", `${noAudio} épisode${noAudio > 1 ? "s" : ""} sans fichier audio lisible.`);
    else add("ok", "Tous les épisodes ont un fichier audio.");
    if (noDescription > 0) add("warn", `${noDescription} épisode${noDescription > 1 ? "s" : ""} sans description.`);
  }

  return { items, ready: !items.some((i) => i.level === "error") };
}
