import { prisma } from "@/lib/db";
import { getSignedDownloadUrl } from "@/lib/storage";

// Pochette du podcast pour le flux : redirige vers un lien de stockage frais.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const podcast = await prisma.podcast.findUnique({ where: { rssSlug: slug }, select: { coverKey: true } });
  if (!podcast?.coverKey) return new Response("Introuvable.", { status: 404 });
  const url = await getSignedDownloadUrl(podcast.coverKey, 6 * 3600);
  return Response.redirect(new URL(url, req.url).toString(), 302);
}
