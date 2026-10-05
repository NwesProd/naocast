"use client";

import { goExternal } from "@/lib/goExternal";
import { useState } from "react";
import type { EpisodeUsage } from "@/lib/entitlements";

interface PlanCard {
  key: "FREE" | "BASIC" | "INFINITY" | "LIFETIME";
  name: string;
  modules: string;
  priceLabel: string;
  monthlyCheckoutKey?: "BASIC_MONTH" | "INFINITY_MONTH";
  yearlyCheckoutKey?: "BASIC_YEAR" | "INFINITY_YEAR";
  lifetimeCheckoutKey?: "LIFETIME";
  note?: string;
}

const PLAN_CARDS: PlanCard[] = [
  {
    key: "FREE",
    name: "naocast free",
    modules: "Intro, Montage, Transcript",
    priceLabel: "0€",
    note: "Limité à 1 épisode au total.",
  },
  {
    key: "BASIC",
    name: "naocast basic",
    modules: "Intro, Montage, Transcript",
    priceLabel: "22,80€ TTC / mois",
    monthlyCheckoutKey: "BASIC_MONTH",
    yearlyCheckoutKey: "BASIC_YEAR",
    note: "10 épisodes/mois · 1 podcast",
  },
  // naocast infinity masqué pour le moment (offre pas encore mise en avant),
  // le forfait existe toujours côté quotas/Stripe, seule la carte est cachée.
  {
    key: "LIFETIME",
    name: "naocast lifetime",
    modules: "Tous les modules",
    priceLabel: "328€ TTC une fois",
    lifetimeCheckoutKey: "LIFETIME",
    note: "Épisodes illimités · multi-podcast",
  },
];

export function BillingClient({
  usage,
  hasStripeCustomer,
  subscriptionStatus,
  currentPeriodEnd,
  lifetimeSeatsLeft,
}: {
  usage: EpisodeUsage;
  hasStripeCustomer: boolean;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  lifetimeSeatsLeft: number;
}) {
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function checkout(planKey: string) {
    setLoadingKey(planKey);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Impossible de démarrer le paiement.");
      goExternal(data.url);
    } catch (err) {
      setError((err as Error).message);
      setLoadingKey(null);
    }
  }

  async function openPortal() {
    setLoadingKey("portal");
    setError(null);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Impossible d'ouvrir le portail.");
      goExternal(data.url);
    } catch (err) {
      setError((err as Error).message);
      setLoadingKey(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-white p-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm text-text-muted">Forfait actuel</p>
          <p className="font-semibold text-ink">
            {usage.planLabel}
            {usage.limit !== null && ` · ${usage.used}/${usage.limit} épisode${usage.limit > 1 ? "s" : ""} ${usage.periodLabel}`}
          </p>
          {subscriptionStatus && subscriptionStatus !== "active" && (
            <p className="text-xs text-[#8A2E1F] mt-0.5">Statut Stripe : {subscriptionStatus}</p>
          )}
          {currentPeriodEnd && (
            <p className="text-xs text-text-muted mt-0.5">
              Renouvellement le {new Date(currentPeriodEnd).toLocaleDateString("fr-FR")}
            </p>
          )}
        </div>
        {hasStripeCustomer && (
          <button
            onClick={openPortal}
            disabled={loadingKey === "portal"}
            className="text-xs font-semibold rounded-pill bg-white border border-border px-3 py-1.5 hover:bg-[#FAFAF8] transition"
          >
            {loadingKey === "portal" ? "Ouverture..." : "Gérer mon abonnement / résilier"}
          </button>
        )}
      </div>

      {error && <p className="text-sm text-[#8A2E1F]">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {PLAN_CARDS.map((card) => {
          const current = usage.plan === card.key;
          return (
            <div
              key={card.key}
              className={`rounded-xl border p-5 space-y-3 flex flex-col ${
                current ? "border-primary-button ring-1 ring-primary-button" : "border-border"
              } bg-white`}
            >
              <div>
                <h2 className="font-bold text-ink">{card.name}</h2>
                <p className="text-xs text-text-muted mt-1">{card.modules}</p>
              </div>
              <p className="text-lg font-bold text-ink">{card.priceLabel}</p>
              {card.note && <p className="text-xs text-text-muted flex-1">{card.note}</p>}

              {current ? (
                <span className="text-xs font-semibold text-primary-button">Forfait actuel</span>
              ) : card.key === "FREE" ? (
                <span className="text-xs text-text-muted">Forfait de départ, sans action requise.</span>
              ) : (
                <div className="space-y-2">
                  {card.monthlyCheckoutKey && (
                    <button
                      onClick={() => checkout(card.monthlyCheckoutKey!)}
                      disabled={!!loadingKey}
                      className="w-full text-sm font-semibold rounded-pill bg-primary-button text-white px-3 py-2 hover:opacity-90 transition disabled:opacity-50"
                    >
                      {loadingKey === card.monthlyCheckoutKey ? "..." : "Mensuel"}
                    </button>
                  )}
                  {card.yearlyCheckoutKey && (
                    <button
                      onClick={() => checkout(card.yearlyCheckoutKey!)}
                      disabled={!!loadingKey}
                      className="w-full text-sm font-semibold rounded-pill bg-white border border-border px-3 py-2 hover:bg-[#FAFAF8] transition disabled:opacity-50"
                    >
                      {loadingKey === card.yearlyCheckoutKey ? "..." : "Annuel - 2 mois offerts"}
                    </button>
                  )}
                  {card.lifetimeCheckoutKey && (
                    <>
                      <button
                        onClick={() => checkout(card.lifetimeCheckoutKey!)}
                        disabled={!!loadingKey || lifetimeSeatsLeft <= 0}
                        className="w-full text-sm font-semibold rounded-pill bg-primary-button text-white px-3 py-2 hover:opacity-90 transition disabled:opacity-50"
                      >
                        {lifetimeSeatsLeft <= 0
                          ? "Offre complète"
                          : loadingKey === card.lifetimeCheckoutKey
                            ? "..."
                            : "Acheter à vie"}
                      </button>
                      <p className="text-[11px] text-text-muted">{lifetimeSeatsLeft} place(s) restante(s)</p>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
