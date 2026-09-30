import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/authz";
import { stripe } from "@/lib/stripe";

// Portail de facturation Stripe (changer de carte, résilier, voir les
// factures) : rien de tout ça n'est réimplémenté dans naocast., Stripe le
// gère entièrement pour les comptes ayant déjà un abonnement/achat.
export async function POST(req: Request) {
  const userId = await requireUserId();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { stripeCustomerId: true } });

  if (!user.stripeCustomerId) {
    return NextResponse.json({ error: "Aucun abonnement à gérer pour le moment." }, { status: 400 });
  }

  const base = process.env.NEXTAUTH_URL || req.headers.get("origin") || "http://localhost:3000";
  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${base}/billing`,
  });

  return NextResponse.json({ url: session.url });
}
