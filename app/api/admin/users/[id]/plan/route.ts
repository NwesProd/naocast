import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAdmin } from "@/lib/adminApi";

const schema = z.object({ plan: z.enum(["FREE", "BASIC", "INFINITY", "LIFETIME"]) });

// Attribution manuelle d'un forfait (offrir un accès à un testeur, geste
// commercial...). Stripe reste la source de vérité pour un abonné payant :
// son webhook réécrira le forfait au prochain évènement d'abonnement.
export const PATCH = withAdmin<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Forfait invalide." }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "Utilisateur introuvable." }, { status: 404 });

  const updated = await prisma.user.update({ where: { id }, data: { plan: parsed.data.plan }, select: { plan: true } });
  return NextResponse.json({ ok: true, plan: updated.plan });
});
