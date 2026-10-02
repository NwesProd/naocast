import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

// Le middleware ne protège que les pages, pas les routes API : chaque route
// API vérifie déjà elle-même l'authentification (requireUserId/requireOwnedEpisode
// dans lib/authz.ts) et répond en JSON plutôt que par une redirection HTML.
// Ça évite aussi la limite de taille de requête que Next.js applique aux
// requêtes passant par le middleware (bloquait les uploads > 10 Mo, cf.
// générique/pochette du podcast ou rushs vidéo).
const PUBLIC_PATHS = ["/login", "/signup", "/forgot-password", "/reset-password", "/magic-login", "/unsubscribe"];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Le back office a sa propre connexion et sa propre session (cf.
  // lib/admin.ts) : il ne dépend pas de la session de l'app, c'est son propre
  // layout qui redirige vers /admin/login.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return;

  if (!req.auth && !PUBLIC_PATHS.includes(pathname)) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    return NextResponse.redirect(loginUrl);
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};
