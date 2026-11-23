import { prisma } from "@/lib/db";
import { getObjectSize, getSignedDownloadUrl } from "@/lib/storage";
import { recordDownload } from "@/lib/audioStats";

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
  await recordDownload(episode!.id, req);
  const url = await getSignedDownloadUrl(key, 6 * 3600);
  return Response.redirect(new URL(url, req.url).toString(), 302);
}

// Vérification de l'épisode (taille, type) sans redirection : le lien de stockage signé n'accepte que la lecture.
export async function HEAD(_req: Request, { params }: { params: Promise<{ slug: string; file: string }> }) {
  const { slug, file } = await params;
  const episodeId = file.replace(/\.mp3$/i, "");
  const episode = await prisma.episode.findFirst({
    where: { id: episodeId, audioPublishedAt: { not: null }, podcast: { rssSlug: slug } },
    include: { exports: { where: { type: "AUDIO" }, take: 1 } },
  });
  const key = episode?.exports[0]?.storageKey;
  if (!key) return new Response(null, { status: 404 });
  const size = await getObjectSize(key);
  return new Response(null, {
    headers: { "Content-Type": "audio/mpeg", "Accept-Ranges": "bytes", ...(size != null ? { "Content-Length": String(size) } : {}) },
  });
}
