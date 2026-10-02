import { prisma } from "@/lib/db";
import { isTestEmail } from "@/lib/adminStats";
import { listAllObjects } from "@/lib/storage";
import type { Plan } from "@/app/generated/prisma/client";

// Poids des fichiers stockés (R2/B2), par utilisateur et au global, pour le
// back office. La source de vérité est le contenu réel du bucket (les
// aperçus, rendus et anciens fichiers remplacés n'ont pas tous leur taille en
// base), rattaché aux utilisateurs via :
// - rushes/{episodeId}/... et episodes/{episodeId}/... : l'épisode, donc son
//   propriétaire ;
// - les fichiers du podcast (pochette, génériques, logo, documents de
//   référence) : les clés enregistrées sur le Podcast.
// Un fichier qu'aucune ligne de la base ne référence (ancienne pochette
// remplacée, épisode supprimé sans nettoyage...) est "non rattaché" : c'est du
// stockage facturé pour rien.

export interface UserStorage {
  bytes: number;
  files: number;
  rushes: number; // octets
  episodes: number; // octets : rendus, génériques d'épisode, teaser
  podcast: number; // octets : pochette, génériques et logo du podcast, documents
}

export interface StorageReport {
  totalBytes: number;
  totalFiles: number;
  byUser: Map<string, UserStorage>;
  orphanBytes: number;
  orphanFiles: number;
}

const EMPTY: UserStorage = { bytes: 0, files: 0, rushes: 0, episodes: 0, podcast: 0 };

// Lister tout le bucket à chaque affichage du dashboard serait inutilement
// lent : le résultat est gardé quelques minutes en mémoire.
const CACHE_TTL_MS = 3 * 60 * 1000;
let cache: { at: number; promise: Promise<StorageReport> } | null = null;

async function buildReport(): Promise<StorageReport> {
  const objects = await listAllObjects();

  // Requêtes séquentielles (pas de rafale, cf. lib/episode.ts sur P1017).
  const episodes = await prisma.episode.findMany({ select: { id: true, podcast: { select: { userId: true } } } });
  const podcasts = await prisma.podcast.findMany({
    select: {
      userId: true,
      coverKey: true,
      introKey: true,
      outroKey: true,
      logoKey: true,
      introPreviewKey: true,
      outroPreviewKey: true,
      referenceFiles: true,
    },
  });

  const ownerOfEpisode = new Map(episodes.map((e) => [e.id, e.podcast.userId]));
  const ownerOfPodcastKey = new Map<string, string>();
  for (const p of podcasts) {
    const keys = [p.coverKey, p.introKey, p.outroKey, p.logoKey, p.introPreviewKey, p.outroPreviewKey];
    const refs = Array.isArray(p.referenceFiles) ? (p.referenceFiles as { key?: unknown }[]) : [];
    for (const r of refs) if (typeof r?.key === "string") keys.push(r.key);
    for (const k of keys) if (k) ownerOfPodcastKey.set(k, p.userId);
  }

  const report: StorageReport = { totalBytes: 0, totalFiles: 0, byUser: new Map(), orphanBytes: 0, orphanFiles: 0 };
  for (const { key, size } of objects) {
    report.totalBytes += size;
    report.totalFiles += 1;

    const [root, episodeId] = key.split("/");
    let owner: string | undefined;
    let category: "rushes" | "episodes" | "podcast" = "podcast";
    if (root === "rushes" || root === "episodes") {
      owner = ownerOfEpisode.get(episodeId);
      category = root;
    } else {
      owner = ownerOfPodcastKey.get(key);
    }

    if (!owner) {
      report.orphanBytes += size;
      report.orphanFiles += 1;
      continue;
    }
    const entry = report.byUser.get(owner) ?? { ...EMPTY };
    entry.bytes += size;
    entry.files += 1;
    entry[category] += size;
    report.byUser.set(owner, entry);
  }
  return report;
}

export function getStorageReport(): Promise<StorageReport> {
  if (!cache || Date.now() - cache.at > CACHE_TTL_MS) {
    const promise = buildReport();
    cache = { at: Date.now(), promise };
    // Un échec ne reste pas en cache : le prochain affichage réessaie.
    promise.catch(() => {
      if (cache?.promise === promise) cache = null;
    });
  }
  return cache.promise;
}

export async function getUserStorage(userId: string): Promise<UserStorage> {
  const report = await getStorageReport();
  return report.byUser.get(userId) ?? { ...EMPTY };
}

export interface StorageSummary {
  totalBytes: number; // tout le bucket (ce qui est facturé)
  realBytes: number; // fichiers des vrais comptes
  realFiles: number;
  testBytes: number; // fichiers des comptes de test (exclus des vrais chiffres)
  orphanBytes: number;
  orphanFiles: number;
  byCategory: { rushes: number; episodes: number; podcast: number }; // vrais comptes
  top: { id: string; email: string; plan: Plan; bytes: number; files: number }[];
}

// Résumé pour le dashboard : les comptes de test sont mis à part, comme dans
// les autres chiffres du back office.
export async function getStorageSummary(): Promise<StorageSummary> {
  const report = await getStorageReport();
  const ids = [...report.byUser.keys()];
  const users = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true, plan: true } })
    : [];

  const summary: StorageSummary = {
    totalBytes: report.totalBytes,
    realBytes: 0,
    realFiles: 0,
    testBytes: 0,
    orphanBytes: report.orphanBytes,
    orphanFiles: report.orphanFiles,
    byCategory: { rushes: 0, episodes: 0, podcast: 0 },
    top: [],
  };
  const real: StorageSummary["top"] = [];
  for (const u of users) {
    const s = report.byUser.get(u.id);
    if (!s) continue;
    if (isTestEmail(u.email)) {
      summary.testBytes += s.bytes;
      continue;
    }
    summary.realBytes += s.bytes;
    summary.realFiles += s.files;
    summary.byCategory.rushes += s.rushes;
    summary.byCategory.episodes += s.episodes;
    summary.byCategory.podcast += s.podcast;
    real.push({ id: u.id, email: u.email, plan: u.plan, bytes: s.bytes, files: s.files });
  }
  summary.top = real.sort((a, b) => b.bytes - a.bytes).slice(0, 5);
  return summary;
}
