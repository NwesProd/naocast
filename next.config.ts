import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Évite que Next.js remonte jusqu'à un package-lock.json trouvé plus haut
  // dans l'arborescence (hors de ce repo) pour déterminer la racine du projet.
  turbopack: {
    root: path.join(__dirname),
  },
  // Aucune page de l'app ne peut être affichée dans le cadre d'un autre site
  // (anti-clickjacking). Exception : /admin, affiché dans le back office nwes,
  // dont la CSP est posée à l'exécution dans proxy.ts (liste configurable).
  async headers() {
    return [
      {
        source: "/((?!admin).*)",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
