import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { hasModuleAccess } from "@/lib/plan";

// Clés personnelles du connecteur Claude (serveur MCP). Format "nao_" + 32 octets
// aléatoires : impossible à deviner, et seule leur empreinte SHA-256 est stockée
// (suffisant pour un secret de cette entropie, inutile de le saler).
export const TOKEN_PREFIX = "nao_";
const MAX_ACTIVE_TOKENS = 10;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createApiToken(userId: string, name: string): Promise<{ id: string; token: string }> {
  const active = await prisma.apiToken.count({ where: { userId, revokedAt: null } });
  if (active >= MAX_ACTIVE_TOKENS) throw new Error(`Limite de ${MAX_ACTIVE_TOKENS} clés actives atteinte : révoque-en une d'abord.`);

  const token = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  const row = await prisma.apiToken.create({
    data: { userId, name: name.trim().slice(0, 60) || "Claude", tokenHash: hashToken(token), prefix: token.slice(0, 10) },
  });
  return { id: row.id, token };
}

export type McpAuthResult =
  | { ok: true; userId: string; extraModules: string[]; plan: import("@/app/generated/prisma/client").Plan }
  | { ok: false; status: 401 | 403; message: string; expired?: boolean };

// Identifie l'utilisateur à partir de l'en-tête "Authorization: Bearer nao_...",
// et vérifie que son forfait (ou un déblocage manuel testeur) donne accès au connecteur.
export async function authenticateMcpRequest(req: Request): Promise<McpAuthResult> {
  const header = req.headers.get("authorization") || "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match || !match[1].startsWith(TOKEN_PREFIX)) return { ok: false, status: 401, message: "Clé manquante ou invalide." };

  const row = await prisma.apiToken.findUnique({
    where: { tokenHash: hashToken(match[1]) },
    include: { user: { select: { id: true, plan: true, extraModules: true } } },
  });
  if (!row || row.revokedAt) return { ok: false, status: 401, message: "Clé manquante ou invalide." };
  // Jeton d'accès OAuth expiré : le client doit le renouveler avec son jeton de rafraîchissement.
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return { ok: false, status: 401, message: "Jeton expiré.", expired: true };

  if (!hasModuleAccess(row.user.plan, "mcp", row.user.extraModules)) {
    return { ok: false, status: 403, message: "Le connecteur Claude est réservé à naocast infinity et naocast lifetime." };
  }

  // Dernière utilisation : mise à jour au plus une fois par minute.
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
    await prisma.apiToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  }
  return { ok: true, userId: row.user.id, extraModules: row.user.extraModules, plan: row.user.plan };
}
