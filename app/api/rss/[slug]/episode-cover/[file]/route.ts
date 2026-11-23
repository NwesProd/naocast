import { prisma } from "@/lib/db";
import { serveImage } from "@/lib/rssImage";

// Pochette audio d'un épisode pour le flux.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; file: string }> }) {
  const { slug, file } = await params;
  const episodeId = file.replace(/\.[a-z0-9]+$/i, "");
  const episode = await prisma.episode.findFirst({ where: { id: episodeId, coverKey: { not: null }, podcast: { rssSlug: slug } }, select: { coverKey: true } });
  if (!episode?.coverKey) return new Response("Introuvable.", { status: 404 });
  return serveImage(episode.coverKey);
}
