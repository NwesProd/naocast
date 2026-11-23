import { buildFeed } from "@/lib/rss";

// Flux RSS public du podcast (lu par Apple Podcasts, Spotify, Deezer...).
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const xml = await buildFeed(slug);
  if (!xml) return new Response("Flux introuvable.", { status: 404 });
  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });
}
