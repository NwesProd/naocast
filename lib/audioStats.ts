import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { todayInParis } from "@/lib/moduleProgress";

// Comptage des écoutes : un téléchargement du fichier audio par une application d'écoute compte une fois par
// auditeur (empreinte anonyme adresse IP + application) et par jour. Les robots et les simples vérifications
// (requêtes HEAD) sont ignorés.
const BOT = /bot|crawl|spider|slurp|curl|wget|python|node-fetch|go-http|java\/|okhttp\/[0-9.]+$|feedvalidator|castfeedvalidator|monitor|preview|headless|libwww|axios|undici/i;

export async function recordDownload(episodeId: string, req: Request): Promise<void> {
  if (req.method === "HEAD") return;
  const ua = req.headers.get("user-agent") ?? "";
  if (!ua || BOT.test(ua)) return;
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const visitorHash = createHash("sha256").update(`${ip}|${ua}|${process.env.AUTH_SECRET ?? "naocast"}`).digest("hex").slice(0, 32);
  try {
    await prisma.audioDownload.createMany({
      data: [{ episodeId, day: new Date(todayInParis()), visitorHash, userAgent: ua.slice(0, 200) }],
      skipDuplicates: true,
    });
  } catch {
    // Le comptage ne doit jamais empêcher l'écoute.
  }
}

// Écoutes d'un épisode : total (écoutes comptées chez l'ancien hébergeur comprises) et 30 derniers jours.
export async function episodePlays(episodeId: string): Promise<{ total: number; last30: number; imported: number }> {
  const since = new Date(todayInParis());
  since.setUTCDate(since.getUTCDate() - 30);
  const [counted, last30, episode] = await Promise.all([
    prisma.audioDownload.count({ where: { episodeId } }),
    prisma.audioDownload.count({ where: { episodeId, day: { gte: since } } }),
    prisma.episode.findUnique({ where: { id: episodeId }, select: { importedPlays: true } }),
  ]);
  const imported = episode?.importedPlays ?? 0;
  return { total: counted + imported, last30, imported };
}
