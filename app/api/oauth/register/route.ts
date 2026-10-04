import { z } from "zod";
import { prisma } from "@/lib/db";
import { CORS_HEADERS, isAllowedRedirectUri } from "@/lib/oauth";

// Inscription dynamique d'un client OAuth (RFC 7591) : claude.ai s'enregistre ici avant
// de demander l'autorisation. Clients publics uniquement (PKCE, pas de secret).
// Point d'entrée anonyme : limité par adresse IP pour ne pas laisser remplir la base.
const hits = new Map<string, number[]>();
const WINDOW_MS = 3600_000;
const MAX_PER_WINDOW = 30;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
  return recent.length > MAX_PER_WINDOW;
}

const bodySchema = z.object({
  client_name: z.string().max(80).optional(),
  redirect_uris: z.array(z.string().max(500)).min(1).max(5),
  grant_types: z.array(z.string()).optional(),
});

function error(status: number, code: string, description: string) {
  return Response.json({ error: code, error_description: description }, { status, headers: CORS_HEADERS });
}

export async function POST(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  if (rateLimited(ip)) return error(429, "temporarily_unavailable", "Trop de demandes, réessayez plus tard.");

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error(400, "invalid_client_metadata", "Métadonnées du client invalides.");
  const { client_name, redirect_uris, grant_types } = parsed.data;

  if (!redirect_uris.every(isAllowedRedirectUri)) return error(400, "invalid_redirect_uri", "Adresse de redirection non autorisée (https requis).");
  if (grant_types && !grant_types.includes("authorization_code")) return error(400, "invalid_client_metadata", "Le type authorization_code est requis.");

  const name = (client_name || "Claude").replace(/[<>]/g, "").trim().slice(0, 80) || "Claude";
  const client = await prisma.oAuthClient.create({ data: { name, redirectUris: redirect_uris } });

  return Response.json(
    {
      client_id: client.id,
      client_name: client.name,
      redirect_uris: client.redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
    },
    { status: 201, headers: CORS_HEADERS }
  );
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
