import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/authz";

// Révoque une clé : elle cesse de fonctionner immédiatement.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id } = await params;
  const result = await prisma.apiToken.updateMany({ where: { id, userId, revokedAt: null }, data: { revokedAt: new Date() } });
  if (result.count === 0) return NextResponse.json({ error: "Clé introuvable." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
