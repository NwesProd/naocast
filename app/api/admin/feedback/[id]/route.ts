import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAdmin } from "@/lib/adminApi";

// Marque un retour utilisateur comme traité (ou le remet à traiter).
const schema = z.object({ handled: z.boolean() });

export const PATCH = withAdmin<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const result = await prisma.feedback.updateMany({ where: { id }, data: { handled: parsed.data.handled } });
  if (result.count === 0) return NextResponse.json({ error: "Retour introuvable." }, { status: 404 });
  return NextResponse.json({ ok: true });
});
