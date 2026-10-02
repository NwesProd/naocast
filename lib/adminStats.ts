import { prisma } from "@/lib/db";
import { priceIdToPlanKey, type PaidPlanKey } from "@/lib/stripe";
import type { Plan } from "@/app/generated/prisma/client";

const DAY_MS = 24 * 60 * 60 * 1000;

// Prix TTC mensualisés (l'annuel est ramené au mois), cf. lib/plan.ts et la
// page /billing. Sert uniquement à une estimation de revenu récurrent.
const MONTHLY_EQUIVALENT_EUR: Record<Exclude<PaidPlanKey, "LIFETIME">, number> = {
  BASIC_MONTH: 22.8,
  BASIC_YEAR: 228 / 12,
  INFINITY_MONTH: 89,
  INFINITY_YEAR: 890 / 12,
};
const LIFETIME_PRICE_EUR = 328;

export interface DailyPoint {
  date: string; // YYYY-MM-DD
  count: number;
}

// Compte par jour sur les `days` derniers jours (jours sans activité inclus à
// zéro, pour que le graphique garde une échelle de temps régulière).
function bucketByDay(dates: Date[], days: number): DailyPoint[] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setTime(start.getTime() - (days - 1) * DAY_MS);

  const counts = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    counts.set(new Date(start.getTime() + i * DAY_MS).toISOString().slice(0, 10), 0);
  }
  for (const d of dates) {
    const key = d.toISOString().slice(0, 10);
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([date, count]) => ({ date, count }));
}

export async function getDashboardStats() {
  const since30 = new Date(Date.now() - 30 * DAY_MS);
  const since7 = new Date(Date.now() - 7 * DAY_MS);

  // Lots de 5 requêtes maximum en parallèle, jamais les 14 d'un coup : avec
  // les driver adapters de Prisma 7, trop de requêtes concurrentes font fermer
  // la connexion Postgres (P1017, cf. lib/episode.ts).
  const [totalUsers, usersByPlanRaw, newUsers7d, recentUsers, totalEpisodes] = await Promise.all([
    prisma.user.count(),
    prisma.user.groupBy({ by: ["plan"], _count: { _all: true } }),
    prisma.user.count({ where: { createdAt: { gte: since7 } } }),
    prisma.user.findMany({ where: { createdAt: { gte: since30 } }, select: { createdAt: true } }),
    prisma.episode.count(),
  ]);
  const [episodesByStatusRaw, recentEpisodes, podcastCount, subscribers, lifetimeCount] = await Promise.all([
    prisma.episode.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.episode.findMany({ where: { createdAt: { gte: since30 } }, select: { createdAt: true } }),
    prisma.podcast.count(),
    prisma.user.findMany({
      where: { stripePriceId: { not: null }, subscriptionStatus: { in: ["active", "trialing", "past_due"] } },
      select: { stripePriceId: true },
    }),
    prisma.user.count({ where: { plan: "LIFETIME" } }),
  ]);
  const [failedJobs7d, pendingJobs, runningJobs, latestUsers] = await Promise.all([
    prisma.processingJob.count({ where: { status: "FAILED", createdAt: { gte: since7 } } }),
    prisma.processingJob.count({ where: { status: "PENDING" } }),
    prisma.processingJob.count({ where: { status: "RUNNING" } }),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, email: true, plan: true, createdAt: true },
    }),
  ]);

  const usersByPlan: Record<Plan, number> = { FREE: 0, BASIC: 0, INFINITY: 0, LIFETIME: 0 };
  for (const row of usersByPlanRaw) usersByPlan[row.plan] = row._count._all;

  const episodesByStatus: Record<string, number> = {};
  for (const row of episodesByStatusRaw) episodesByStatus[row.status] = row._count._all;

  let mrr = 0;
  for (const s of subscribers) {
    const key = s.stripePriceId ? priceIdToPlanKey(s.stripePriceId) : null;
    if (key && key !== "LIFETIME") mrr += MONTHLY_EQUIVALENT_EUR[key];
  }

  return {
    totalUsers,
    usersByPlan,
    newUsers7d,
    newUsers30d: recentUsers.length,
    signupsDaily: bucketByDay(recentUsers.map((u) => u.createdAt), 30),
    totalEpisodes,
    episodes30d: recentEpisodes.length,
    episodesByStatus,
    episodesDaily: bucketByDay(recentEpisodes.map((e) => e.createdAt), 30),
    podcastCount,
    payingSubscribers: subscribers.length,
    mrrEur: Math.round(mrr * 100) / 100,
    lifetimeCount,
    lifetimeRevenueEur: lifetimeCount * LIFETIME_PRICE_EUR,
    failedJobs7d,
    pendingJobs,
    runningJobs,
    latestUsers,
  };
}
