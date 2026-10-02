import { prisma } from "@/lib/db";
import { priceIdToPlanKey, type PaidPlanKey } from "@/lib/stripe";
import type { Plan, Prisma } from "@/app/generated/prisma/client";

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

// Comptes de test (QA, démos) : domaines réservés par la RFC 2606 (example.*,
// .test, .invalid), qui ne peuvent jamais être de vrais utilisateurs. Ils sont
// exclus des chiffres du back office et des envois d'actualités, mais restent
// visibles (avec une pastille "test") dans la liste des utilisateurs.
const TEST_EMAIL_SUFFIXES = ["@example.com", "@example.org", "@example.net", ".test", ".invalid"];

export const isTestUserWhere: Prisma.UserWhereInput = {
  OR: TEST_EMAIL_SUFFIXES.map((suffix) => ({ email: { endsWith: suffix, mode: "insensitive" as const } })),
};

export const realUserWhere: Prisma.UserWhereInput = { NOT: isTestUserWhere };

export function isTestEmail(email: string): boolean {
  const lower = email.toLowerCase();
  return TEST_EMAIL_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}

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
  // Tout est limité aux vrais comptes : les épisodes et podcasts des comptes
  // de test (leurs "actions") ne comptent pas non plus.
  const ofRealUser = { user: realUserWhere };
  const episodeOfRealUser = { podcast: ofRealUser };

  const [totalUsers, usersByPlanRaw, newUsers7d, recentUsers, totalEpisodes] = await Promise.all([
    prisma.user.count({ where: realUserWhere }),
    prisma.user.groupBy({ by: ["plan"], where: realUserWhere, _count: { _all: true } }),
    prisma.user.count({ where: { ...realUserWhere, createdAt: { gte: since7 } } }),
    prisma.user.findMany({ where: { ...realUserWhere, createdAt: { gte: since30 } }, select: { createdAt: true } }),
    prisma.episode.count({ where: episodeOfRealUser }),
  ]);
  const [episodesByStatusRaw, recentEpisodes, podcastCount, subscribers, lifetimeCount] = await Promise.all([
    prisma.episode.groupBy({ by: ["status"], where: episodeOfRealUser, _count: { _all: true } }),
    prisma.episode.findMany({ where: { ...episodeOfRealUser, createdAt: { gte: since30 } }, select: { createdAt: true } }),
    prisma.podcast.count({ where: ofRealUser }),
    prisma.user.findMany({
      where: { ...realUserWhere, stripePriceId: { not: null }, subscriptionStatus: { in: ["active", "trialing", "past_due"] } },
      select: { stripePriceId: true },
    }),
    prisma.user.count({ where: { ...realUserWhere, plan: "LIFETIME" } }),
  ]);
  const latestUsers = await prisma.user.findMany({
    where: realUserWhere,
    orderBy: { createdAt: "desc" },
    take: 6,
    select: { id: true, email: true, plan: true, createdAt: true },
  });

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
    latestUsers,
  };
}
