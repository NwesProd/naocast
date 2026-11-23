import { prisma } from "@/lib/db";
import { serveImage } from "@/lib/rssImage";

// Pochette du podcast pour le flux.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const podcast = await prisma.podcast.findUnique({ where: { rssSlug: slug }, select: { coverKey: true } });
  if (!podcast?.coverKey) return new Response("Introuvable.", { status: 404 });
  return serveImage(podcast.coverKey);
}
