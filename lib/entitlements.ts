import { prisma } from "@/lib/db";
import { PLAN_EPISODE_LIMIT, PLAN_LABELS, hasModuleAccess, type ModuleKey } from "@/lib/plan";
import type { Plan } from "@/app/generated/prisma/client";

export class PlanLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanLimitError";
  }
}

export class ModuleLockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModuleLockedError";
  }
}

function startOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export interface EpisodeUsage {
  plan: Plan;
  planLabel: string;
  used: number;
  limit: number | null; // null = illimité
  periodLabel: string; // "au total" | "ce mois-ci" | "illimité"
}

// Utilisé à la fois pour l'affichage (dashboard) et pour bloquer la création
// d'un nouvel épisode une fois le quota du forfait atteint.
export async function getEpisodeUsage(userId: string): Promise<EpisodeUsage> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { plan: true } });
  const limit = PLAN_EPISODE_LIMIT[user.plan];
  const podcast = await prisma.podcast.findUnique({ where: { userId }, select: { id: true } });

  if (limit.type === "unlimited" || !podcast) {
    return { plan: user.plan, planLabel: PLAN_LABELS[user.plan], used: 0, limit: null, periodLabel: "illimité" };
  }

  const where =
    limit.type === "total"
      ? { podcastId: podcast.id }
      : { podcastId: podcast.id, createdAt: { gte: startOfMonth() } };

  const used = await prisma.episode.count({ where });

  return {
    plan: user.plan,
    planLabel: PLAN_LABELS[user.plan],
    used,
    limit: limit.count,
    periodLabel: limit.type === "total" ? "au total" : "ce mois-ci",
  };
}

// Appelé avant de créer un épisode (cf. POST /api/episodes) : lève si le
// quota du forfait est déjà atteint.
export async function assertCanCreateEpisode(userId: string): Promise<void> {
  const usage = await getEpisodeUsage(userId);
  if (usage.limit !== null && usage.used >= usage.limit) {
    throw new PlanLimitError(
      `Limite atteinte : ${usage.planLabel} autorise ${usage.limit} épisode${usage.limit > 1 ? "s" : ""} ${usage.periodLabel}. Passez à un forfait supérieur pour continuer.`
    );
  }
}

// Appelé par les modules réservés (Script, Invités...) : lève si le forfait
// de l'utilisateur ne les inclut pas.
export async function assertModuleAccess(userId: string, module: ModuleKey): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { plan: true } });
  if (!hasModuleAccess(user.plan, module)) {
    throw new ModuleLockedError(`Ce module est réservé à naocast infinity et naocast lifetime.`);
  }
}

export async function getUserPlan(userId: string): Promise<Plan> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { plan: true } });
  return user.plan;
}
