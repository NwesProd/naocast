import { prisma } from "@/lib/db";
import { getSignedDownloadUrl } from "@/lib/storage";

// Fichier audio d'un épisode publié dans le flux : redirige vers un lien de stockage frais.
// C'est ici que passeront les téléchargements des plateformes (futur comptage des écoutes).
export async function GET(req: Request, { params }: { params: Promise<{ slug: string; file: string }> }) {
  const { slug, file } = await params;
  const episodeId = file.replace(/\.mp3$/i, "");
  const episode = await prisma.episode.findFirst({
    where: { id: episodeId, audioPublishedAt: { not: null }, podcast: { rssSlug: slug } },
    include: { exports: { where: { type: "AUDIO" }, take: 1 } },
  });
  const key = episode?.exports[0]?.storageKey;
  if (!key) return new Response("Introuvable.", { status: 404 });
  const url = await getSignedDownloadUrl(key, 6 * 3600);
  return Response.redirect(new URL(url, req.url).toString(), 302);
}
