import { NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/db";
import { stripe, priceIdToPlanKey, planKeyToPlan } from "@/lib/stripe";

// Next.js parse le corps en JSON par défaut, mais Stripe signe le corps BRUT
// (octet pour octet) : le lire via `req.text()` plutôt que `req.json()` est
// indispensable, sinon `constructEvent` échoue systématiquement la
// vérification de signature.
export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Webhook non configuré." }, { status: 500 });
  }

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("[stripe webhook] signature invalide:", (err as Error).message);
    return NextResponse.json({ error: "Signature invalide." }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId || session.client_reference_id;
      const planKey = session.metadata?.planKey as keyof typeof import("@/lib/stripe").PRICE_ID_BY_PLAN | undefined;
      if (!userId || !planKey) break;

      const plan = planKeyToPlan(planKey as Parameters<typeof planKeyToPlan>[0]);
      const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;

      let currentPeriodEnd: Date | undefined;
      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        currentPeriodEnd = new Date(subscription.items.data[0].current_period_end * 1000);
      }

      await prisma.user.update({
        where: { id: userId },
        data: {
          plan,
          stripeCustomerId: typeof session.customer === "string" ? session.customer : session.customer?.id,
          stripeSubscriptionId: subscriptionId || null,
          subscriptionStatus: "active",
          currentPeriodEnd: currentPeriodEnd ?? null,
        },
      });
      break;
    }

    // Renouvellement, changement de carte, passage en impayé... la source de
    // vérité du statut/de la date de renouvellement est toujours l'objet
    // Subscription à jour envoyé par Stripe, jamais reconstruite localement.
    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const user = await prisma.user.findUnique({ where: { stripeCustomerId: subscription.customer as string } });
      if (!user) break;

      const priceId = subscription.items.data[0]?.price.id;
      const planKey = priceId ? priceIdToPlanKey(priceId) : null;

      await prisma.user.update({
        where: { id: user.id },
        data: {
          plan: planKey ? planKeyToPlan(planKey) : user.plan,
          stripePriceId: priceId,
          subscriptionStatus: subscription.status,
          currentPeriodEnd: new Date(subscription.items.data[0].current_period_end * 1000),
        },
      });
      break;
    }

    // Abonnement résilié (fin de période après annulation, ou impayé
    // définitif) : retour au forfait gratuit, plus de modules/quota payants.
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const user = await prisma.user.findUnique({ where: { stripeCustomerId: subscription.customer as string } });
      if (!user) break;

      await prisma.user.update({
        where: { id: user.id },
        data: {
          plan: "FREE",
          stripeSubscriptionId: null,
          stripePriceId: null,
          subscriptionStatus: "canceled",
          currentPeriodEnd: null,
        },
      });
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
