import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/authz";

const schema = z.object({ text: z.string().trim().min(1).max(300) });

// Ajoute une tâche à la checklist du podcast.
export async function POST(req: Request) {
  const userId = await requireUserId();
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Écris la tâche (300 caractères maximum)." }, { status: 400 });
  const podcast = await prisma.podcast.findUnique({ where: { userId }, select: { id: true } });
  if (!podcast) return NextResponse.json({ error: "Crée d'abord ton podcast." }, { status: 404 });
  const item = await prisma.checklistItem.create({ data: { podcastId: podcast.id, text: parsed.data.text }, select: { id: true, text: true, done: true } });
  return NextResponse.json(item);
}
