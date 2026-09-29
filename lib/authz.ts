import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new AuthError();

  // Le cookie de session (JWT) n'est jamais revalidé contre la base tant
  // qu'il n'a pas expiré : si le compte a été supprimé entre-temps (reset de
  // la base de dev, suppression de compte...), le cookie reste "valide" mais
  // pointe vers un userId fantôme. Sans cette vérification, la première
  // écriture qui en dépend (ex. upsert Podcast) plante avec une erreur de
  // contrainte de clé étrangère peu explicite, au lieu d'un message clair
  // invitant à se reconnecter.
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true } });
  if (!user) throw new AuthError();

  return session.user.id;
}

export class AuthError extends Error {
  constructor() {
    super("Non authentifié.");
    this.name = "AuthError";
  }
}

export class NoPodcastError extends Error {
  constructor() {
    super("Configurez d'abord votre podcast avant d'ajouter un épisode.");
    this.name = "NoPodcastError";
  }
}

// Un seul podcast par compte au MVP. Impossible de créer un épisode avant
// d'avoir configuré le podcast (titre, générique...) : le dashboard redirige
// déjà vers /podcast dans ce cas, mais on bloque aussi l'API elle-même,
// jamais seulement l'UI.
export async function requirePodcast(userId: string) {
  const podcast = await prisma.podcast.findUnique({ where: { userId } });
  if (!podcast) throw new NoPodcastError();
  return podcast;
}

// Vérifie que l'épisode appartient bien au podcast de l'utilisateur courant.
export async function requireOwnedEpisode(userId: string, episodeId: string) {
  const episode = await prisma.episode.findUnique({
    where: { id: episodeId },
    include: { podcast: true },
  });
  if (!episode || episode.podcast.userId !== userId) {
    throw new Error("Épisode introuvable.");
  }
  return episode;
}
