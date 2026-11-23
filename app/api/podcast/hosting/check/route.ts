import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/authz";
import { checkFeed } from "@/lib/feedCheck";

// Contrôle du flux du podcast avant soumission aux plateformes.
export async function GET() {
  const userId = await requireUserId();
  const podcast = await prisma.podcast.findUnique({ where: { userId }, select: { id: true } });
  if (!podcast) return NextResponse.json({ error: "Podcast introuvable." }, { status: 404 });
  return NextResponse.json(await checkFeed(podcast.id));
}
