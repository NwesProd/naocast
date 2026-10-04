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

// Le back office (/admin) peut être affiché dans un cadre (iframe) du back
// office nwes (app.nwes.fr) : sa CSP n'autorise que les sites de cette liste
// (ADMIN_FRAME_ANCESTORS, séparés par des espaces, app.nwes.fr par défaut).
// Toutes les autres pages interdisent d'être affichées dans un cadre (cf.
// next.config.ts). Pour que le cookie de session admin (SameSite=Strict)
// fonctionne dans ce cadre, l'admin doit être servi depuis un sous-domaine
// du même site que le back office nwes (ADMIN_HOST, ex. naocast-admin.nwes.fr).
function adminFrameAncestors(): string {
  return `'self' ${process.env.ADMIN_FRAME_ANCESTORS || "https://app.nwes.fr"}`;
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isAdminPath = pathname === "/admin" || pathname.startsWith("/admin/");

  // Domaine dédié à l'admin : n'y sert que l'admin, jamais l'app des
  // utilisateurs (connexion, dashboard...).
  const adminHost = process.env.ADMIN_HOST?.toLowerCase();
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").toLowerCase();
  if (adminHost && host === adminHost && !isAdminPath) {
    // Reste sur le domaine d'origine (nextUrl.origin est recalculé à partir de
    // NEXTAUTH_URL, il renverrait sur app.naocast.com et sortirait du cadre).
    const proto = req.headers.get("x-forwarded-proto") || "https";
    return NextResponse.redirect(new URL("/admin", `${proto}://${host}`));
  }

  // Le back office a sa propre connexion et sa propre session (cf.
  // lib/admin.ts) : il ne dépend pas de la session de l'app, c'est son propre
  // layout qui redirige vers /admin/login.
  if (isAdminPath) {
    const res = NextResponse.next();
    res.headers.set("Content-Security-Policy", `frame-ancestors ${adminFrameAncestors()}`);
    return res;
  }

  if (!req.auth && !PUBLIC_PATHS.includes(pathname)) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    // Reprend la page demandée après la connexion (ex. consentement OAuth du connecteur Claude).
    if (req.method === "GET" && pathname !== "/") loginUrl.searchParams.set("next", `${pathname}${req.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api|\\.well-known).*)"],
};
