import type { Plan } from "@/app/generated/prisma/client";

// Les 4 forfaits naocast. : modules accessibles, limite d'épisodes, et prix
// affiché (les Price IDs Stripe réels vivent dans les variables d'env, cf.
// lib/stripe.ts, jamais en dur ici pour pouvoir changer d'environnement
// Stripe test/live sans toucher au code).
export type ModuleKey = "script" | "invites" | "tournage" | "intro" | "montage" | "transcript" | "extraits" | "miniature" | "diffusion" | "lead-magnet" | "sponsoring";

const BASE_MODULES: ModuleKey[] = ["intro", "montage", "transcript"];
const ALL_MODULES: ModuleKey[] = [
  "script",
  "invites",
  "tournage",
  "intro",
  "montage",
  "transcript",
  "extraits",
  "miniature",
  "diffusion",
  "lead-magnet",
  "sponsoring",
];

export type EpisodeLimit = { type: "total" | "monthly"; count: number } | { type: "unlimited" };

export const PLAN_LABELS: Record<Plan, string> = {
  FREE: "naocast free",
  BASIC: "naocast basic",
  INFINITY: "naocast infinity",
  LIFETIME: "naocast lifetime",
};

export const PLAN_MODULES: Record<Plan, ModuleKey[]> = {
  FREE: BASE_MODULES,
  BASIC: BASE_MODULES,
  INFINITY: ALL_MODULES,
  LIFETIME: ALL_MODULES,
};

export const PLAN_EPISODE_LIMIT: Record<Plan, EpisodeLimit> = {
  FREE: { type: "total", count: 1 },
  BASIC: { type: "monthly", count: 10 },
  INFINITY: { type: "unlimited" },
  LIFETIME: { type: "unlimited" },
};

// Multi-podcast (Infinity/Lifetime) reste hors scope pour l'instant (un seul
// podcast par compte dans tout le reste du code, cf. Podcast.userId unique) :
// seule l'intention est actée ici, à construire plus tard.
export const PLAN_MULTI_PODCAST: Record<Plan, boolean> = {
  FREE: false,
  BASIC: false,
  INFINITY: true,
  LIFETIME: true,
};

// Un épisode validé (exporté) ne peut plus être supprimé sur les forfaits à
// quota (free : 1 épisode au total, basic : 10 par mois) : sinon supprimer puis
// recréer un épisode contournerait la limite. Sans objet pour infinity et
// lifetime (épisodes illimités).
export const PLAN_LOCKS_VALIDATED_EPISODE_DELETION: Record<Plan, boolean> = {
  FREE: true,
  BASIC: true,
  INFINITY: false,
  LIFETIME: false,
};

export const LIFETIME_SEATS_LIMIT = 50;

// Modules réellement construits, avec leur libellé : ce sont les seuls qu'on
// peut activer à la main pour un utilisateur (les autres de ModuleKey n'existent
// pas encore dans l'app).
export const BUILT_MODULES: { key: ModuleKey; label: string }[] = [
  { key: "script", label: "Script" },
  { key: "invites", label: "Invités" },
  { key: "intro", label: "Intro" },
  { key: "montage", label: "Montage" },
  { key: "transcript", label: "Transcript" },
];

// `extraModules` : modules activés à la main pour cet utilisateur, en plus de
// son forfait (colonne User.extraModules).
export function hasModuleAccess(plan: Plan, module: ModuleKey, extraModules: readonly string[] = []): boolean {
  return PLAN_MODULES[plan].includes(module) || extraModules.includes(module);
}
