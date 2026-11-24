import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/authz";

const schema = z.object({ done: z.boolean().optional(), text: z.string().trim().min(1).max(300).optional() });

async function owned(userId: string, id: string) {
  const item = await prisma.checklistItem.findUnique({ where: { id }, include: { podcast: { select: { userId: true } } } });
  return item && item.podcast.userId === userId ? item : null;
}

// Coche ou renomme une tâche.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id } = await params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  if (!(await owned(userId, id))) return NextResponse.json({ error: "Tâche introuvable." }, { status: 404 });
  await prisma.checklistItem.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id } = await params;
  if (!(await owned(userId, id))) return NextResponse.json({ error: "Tâche introuvable." }, { status: 404 });
  await prisma.checklistItem.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
