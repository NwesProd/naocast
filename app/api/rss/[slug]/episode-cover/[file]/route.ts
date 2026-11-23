import { prisma } from "@/lib/db";
import { getSignedDownloadUrl } from "@/lib/storage";

// Pochette audio d'un épisode pour le flux : redirige vers un lien de stockage frais.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string; file: string }> }) {
  const { slug, file } = await params;
  const episodeId = file.replace(/\.[a-z0-9]+$/i, "");
  const episode = await prisma.episode.findFirst({ where: { id: episodeId, coverKey: { not: null }, podcast: { rssSlug: slug } }, select: { coverKey: true } });
  if (!episode?.coverKey) return new Response("Introuvable.", { status: 404 });
  const url = await getSignedDownloadUrl(episode.coverKey, 6 * 3600);
  return Response.redirect(new URL(url, req.url).toString(), 302);
}
