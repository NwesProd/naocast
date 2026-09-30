import Stripe from "stripe";
import type { Plan } from "@/app/generated/prisma/client";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

export type BillingInterval = "month" | "year";

// Un plan payant Stripe = (Plan naocast, intervalle). Le Lifetime n'a pas
// d'intervalle (paiement unique, mode "payment" plutôt que "subscription").
export type PaidPlanKey = "BASIC_MONTH" | "BASIC_YEAR" | "INFINITY_MONTH" | "INFINITY_YEAR" | "LIFETIME";

// Price IDs Stripe : configurés en variables d'env (jamais en dur), un même
// code fonctionnant aussi bien avec le compte Stripe test qu'avec le live.
export const PRICE_ID_BY_PLAN: Record<PaidPlanKey, string | undefined> = {
  BASIC_MONTH: process.env.STRIPE_PRICE_BASIC_MONTHLY,
  BASIC_YEAR: process.env.STRIPE_PRICE_BASIC_YEARLY,
  INFINITY_MONTH: process.env.STRIPE_PRICE_INFINITY_MONTHLY,
  INFINITY_YEAR: process.env.STRIPE_PRICE_INFINITY_YEARLY,
  LIFETIME: process.env.STRIPE_PRICE_LIFETIME,
};

export function planKeyToPlan(key: PaidPlanKey): Plan {
  if (key === "LIFETIME") return "LIFETIME";
  if (key.startsWith("INFINITY")) return "INFINITY";
  return "BASIC";
}

export function priceIdToPlanKey(priceId: string): PaidPlanKey | null {
  const entry = (Object.entries(PRICE_ID_BY_PLAN) as [PaidPlanKey, string | undefined][]).find(
    ([, id]) => id === priceId
  );
  return entry ? entry[0] : null;
}

export function isLifetimeKey(key: PaidPlanKey): boolean {
  return key === "LIFETIME";
}
