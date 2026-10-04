import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getUserAccess } from "@/lib/entitlements";
import { hasModuleAccess } from "@/lib/plan";
import { CODE_TTL_SEC, baseUrl, randomSecret, sha256Hex } from "@/lib/oauth";
import { validateAuthorizeParams } from "@/lib/oauthRequest";

// Décision de l'utilisateur sur la page de consentement (/oauth/authorize) : émet un code
// d'autorisation à usage unique et renvoie vers l'application (claude.ai).
function redirectTo(uri: string, params: Record<string, string | null>) {
  const url = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  return NextResponse.redirect(url, 303);
}

export async function POST(req: Request) {
  // Protection CSRF : la décision ne vient que de notre propre page.
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || "https";
  if (origin && origin !== baseUrl() && origin !== `${proto}://${host}` && origin !== `http://${host}`) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });

  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const form = await req.formData();
  const request = await validateAuthorizeParams((name) => (form.get(name) as string | null) ?? null);
  if ("error" in request) return NextResponse.json({ error: request.error }, { status: 400 });

  if (form.get("decision") !== "approve") {
    return redirectTo(request.redirectUri, { error: "access_denied", state: request.state });
  }

  const access = await getUserAccess(session.user.id);
  if (!hasModuleAccess(access.plan, "mcp", access.extraModules)) {
    return redirectTo(request.redirectUri, { error: "access_denied", error_description: "Connecteur réservé à naocast infinity et lifetime.", state: request.state });
  }

  const code = randomSecret();
  await prisma.oAuthCode.create({
    data: {
      codeHash: sha256Hex(code),
      clientId: request.clientId,
      userId: session.user.id,
      redirectUri: request.redirectUri,
      codeChallenge: request.codeChallenge,
      expiresAt: new Date(Date.now() + CODE_TTL_SEC * 1000),
    },
  });
  return redirectTo(request.redirectUri, { code, state: request.state, iss: baseUrl() });
}
