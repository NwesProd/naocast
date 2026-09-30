import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/authz";
import { stripe, PRICE_ID_BY_PLAN, isLifetimeKey, type PaidPlanKey } from "@/lib/stripe";
import { LIFETIME_SEATS_LIMIT } from "@/lib/plan";
import { z } from "zod";

const bodySchema = z.object({
  planKey: z.enum(["BASIC_MONTH", "BASIC_YEAR", "INFINITY_MONTH", "INFINITY_YEAR", "LIFETIME"]),
});

function appUrl(req: Request): string {
  return process.env.NEXTAUTH_URL || req.headers.get("origin") || "http://localhost:3000";
}

// Crée une session Stripe Checkout pour souscrire (Basic/Infinity, mode
// "subscription") ou acheter (Lifetime, mode "payment" unique) un forfait.
// Redirige ensuite l'utilisateur vers l'URL Stripe retournée.
export async function POST(req: Request) {
  const userId = await requireUserId();
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  const planKey = parsed.data.planKey as PaidPlanKey;
  const priceId = PRICE_ID_BY_PLAN[planKey];
  if (!priceId) {
    return NextResponse.json({ error: "Ce forfait n'est pas encore configuré côté paiement." }, { status: 500 });
  }

  const lifetime = isLifetimeKey(planKey);
  if (lifetime) {
    const seatsTaken = await prisma.user.count({ where: { plan: "LIFETIME" } });
    if (seatsTaken >= LIFETIME_SEATS_LIMIT) {
      return NextResponse.json({ error: "L'offre naocast lifetime, limitée à 50 utilisateurs, est complète." }, { status: 403 });
    }
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({ email: user.email, metadata: { userId } });
    customerId = customer.id;
    await prisma.user.update({ where: { id: userId }, data: { stripeCustomerId: customerId } });
  }

  const base = appUrl(req);
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: lifetime ? "payment" : "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${base}/billing?checkout=success`,
    cancel_url: `${base}/billing?checkout=cancel`,
    client_reference_id: userId,
    metadata: { userId, planKey },
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: session.url });
}
