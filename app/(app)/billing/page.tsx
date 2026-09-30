import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getEpisodeUsage } from "@/lib/entitlements";
import { LIFETIME_SEATS_LIMIT } from "@/lib/plan";
import { BillingClient } from "./BillingClient";

// Page "Abonnement" : forfait actuel + quota, et les 4 forfaits naocast.
// pour souscrire/changer (cf. lib/plan.ts pour le détail de chacun).
export default async function BillingPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [usage, user, lifetimeSeatsTaken] = await Promise.all([
    getEpisodeUsage(session.user.id),
    prisma.user.findUniqueOrThrow({ where: { id: session.user.id }, select: { plan: true, stripeCustomerId: true, subscriptionStatus: true, currentPeriodEnd: true } }),
    prisma.user.count({ where: { plan: "LIFETIME" } }),
  ]);

  return (
    <main className="p-8 max-w-5xl w-full">
      <h1 className="text-2xl font-bold mb-1">Abonnement</h1>
      <p className="text-sm text-text-muted mb-6">Choisissez le forfait adapté à votre rythme de publication.</p>

      <BillingClient
        usage={usage}
        hasStripeCustomer={!!user.stripeCustomerId}
        subscriptionStatus={user.subscriptionStatus}
        currentPeriodEnd={user.currentPeriodEnd ? user.currentPeriodEnd.toISOString() : null}
        lifetimeSeatsLeft={Math.max(0, LIFETIME_SEATS_LIMIT - lifetimeSeatsTaken)}
      />
    </main>
  );
}
