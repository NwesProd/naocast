import { prisma } from "@/lib/db";
import { getUserAccess } from "@/lib/entitlements";
import { hasModuleAccess } from "@/lib/plan";
import { CORS_HEADERS, issueConnectionTokens, pkceMatches, rotateConnectionTokens, sha256Hex, tokenResponse } from "@/lib/oauth";

// Point d'échange OAuth : code d'autorisation (+ PKCE) contre jetons, ou rafraîchissement.
const HEADERS = { ...CORS_HEADERS, "Cache-Control": "no-store", Pragma: "no-cache" };

function error(code: string, description: string, status = 400) {
  return Response.json({ error: code, error_description: description }, { status, headers: HEADERS });
}

async function readParams(req: Request): Promise<URLSearchParams> {
  const type = req.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return new URLSearchParams(Object.entries(body).filter(([, v]) => typeof v === "string") as [string, string][]);
  }
  return new URLSearchParams(await req.text());
}

export async function POST(req: Request) {
  const params = await readParams(req);
  const grant = params.get("grant_type");

  if (grant === "refresh_token") {
    const refresh = params.get("refresh_token");
    if (!refresh) return error("invalid_request", "refresh_token manquant.");
    const tokens = await rotateConnectionTokens(refresh);
    if (!tokens) return error("invalid_grant", "Jeton de rafraîchissement invalide ou expiré.");
    return Response.json(tokenResponse(tokens), { headers: HEADERS });
  }

  if (grant !== "authorization_code") return error("unsupported_grant_type", "Type d'autorisation non géré.");

  const code = params.get("code");
  const verifier = params.get("code_verifier");
  const clientId = params.get("client_id");
  const redirectUri = params.get("redirect_uri");
  if (!code || !verifier || !clientId) return error("invalid_request", "code, code_verifier et client_id sont requis.");

  const row = await prisma.oAuthCode.findUnique({ where: { codeHash: sha256Hex(code) }, include: { client: true } });
  if (!row || row.clientId !== clientId || row.expiresAt.getTime() < Date.now()) return error("invalid_grant", "Code invalide ou expiré.");
  if (redirectUri && redirectUri !== row.redirectUri) return error("invalid_grant", "redirect_uri différent de celui de l'autorisation.");
  if (!pkceMatches(verifier, row.codeChallenge)) return error("invalid_grant", "Vérification PKCE échouée.");

  // Usage unique : un code rejoué est refusé.
  const claimed = await prisma.oAuthCode.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  if (claimed.count !== 1) return error("invalid_grant", "Code déjà utilisé.");

  const access = await getUserAccess(row.userId).catch(() => null);
  if (!access || !hasModuleAccess(access.plan, "mcp", access.extraModules)) {
    return error("access_denied", "Le connecteur Claude est réservé à naocast infinity et naocast lifetime.", 403);
  }

  const tokens = await issueConnectionTokens(row.userId, row.client);
  return Response.json(tokenResponse(tokens), { headers: HEADERS });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
