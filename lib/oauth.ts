import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import { appUrl } from "@/lib/email";
import { TOKEN_PREFIX, hashToken } from "@/lib/apiTokens";

// OAuth 2.1 pour le connecteur Claude (claude.ai "Ajouter un connecteur personnalisé") :
// inscription dynamique du client (RFC 7591), code d'autorisation + PKCE S256,
// jetons d'accès courts et jetons de rafraîchissement (rotation). Les métadonnées
// sont publiées en /.well-known (RFC 8414 et RFC 9728).

export const ACCESS_TOKEN_TTL_SEC = 3600;
export const REFRESH_TOKEN_TTL_SEC = 90 * 24 * 3600;
export const CODE_TTL_SEC = 300;

export const baseUrl = () => appUrl();
export const mcpResourceUrl = () => `${baseUrl()}/api/mcp`;
export const protectedResourceMetadataUrl = () => `${baseUrl()}/.well-known/oauth-protected-resource/api/mcp`;

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomSecret(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

// PKCE : S256(code_verifier) doit égaler le challenge enregistré à l'autorisation.
export function pkceMatches(verifier: string, challenge: string): boolean {
  if (verifier.length < 43 || verifier.length > 128) return false;
  const computed = createHash("sha256").update(verifier).digest("base64url");
  const a = Buffer.from(computed);
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Redirection admise à l'inscription : https, ou http en local (clients de développement),
// sans fragment ni identifiants.
export function isAllowedRedirectUri(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.hash || url.username || url.password) return false;
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]");
  } catch {
    return false;
  }
}

export function tokenResponse(tokens: { access: string; refresh: string }) {
  return {
    access_token: tokens.access,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SEC,
    refresh_token: tokens.refresh,
  };
}

// Crée (ou renouvelle) la connexion d'un utilisateur avec un client : une seule ligne par
// couple (utilisateur, client), les anciennes connexions du même client sont révoquées.
export async function issueConnectionTokens(userId: string, client: { id: string; name: string }): Promise<{ access: string; refresh: string }> {
  const access = `${TOKEN_PREFIX}${randomSecret()}`;
  const refresh = `naor_${randomSecret()}`;
  const now = Date.now();

  await prisma.$transaction([
    prisma.apiToken.updateMany({ where: { userId, clientId: client.id, revokedAt: null }, data: { revokedAt: new Date() } }),
    prisma.apiToken.create({
      data: {
        userId,
        name: (/claude/i.test(client.name) ? client.name : `Claude (${client.name})`).slice(0, 60),
        tokenHash: hashToken(access),
        prefix: access.slice(0, 10),
        clientId: client.id,
        expiresAt: new Date(now + ACCESS_TOKEN_TTL_SEC * 1000),
        refreshHash: hashToken(refresh),
        refreshExpiresAt: new Date(now + REFRESH_TOKEN_TTL_SEC * 1000),
      },
    }),
  ]);
  return { access, refresh };
}

// Rotation : le jeton de rafraîchissement présenté est consommé, un nouveau couple est émis
// sur la même ligne (la connexion garde son historique d'utilisation).
export async function rotateConnectionTokens(refreshToken: string): Promise<{ access: string; refresh: string } | null> {
  const row = await prisma.apiToken.findUnique({ where: { refreshHash: hashToken(refreshToken) } });
  if (!row || row.revokedAt || !row.refreshExpiresAt || row.refreshExpiresAt.getTime() < Date.now()) return null;

  const access = `${TOKEN_PREFIX}${randomSecret()}`;
  const refresh = `naor_${randomSecret()}`;
  const now = Date.now();
  // Garde contre deux rafraîchissements simultanés avec le même jeton : un seul gagne.
  const updated = await prisma.apiToken.updateMany({
    where: { id: row.id, refreshHash: row.refreshHash, revokedAt: null },
    data: {
      tokenHash: hashToken(access),
      prefix: access.slice(0, 10),
      expiresAt: new Date(now + ACCESS_TOKEN_TTL_SEC * 1000),
      refreshHash: hashToken(refresh),
      refreshExpiresAt: new Date(now + REFRESH_TOKEN_TTL_SEC * 1000),
    },
  });
  return updated.count === 1 ? { access, refresh } : null;
}
