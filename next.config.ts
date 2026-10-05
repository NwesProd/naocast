import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Évite que Next.js remonte jusqu'à un package-lock.json trouvé plus haut
  // dans l'arborescence (hors de ce repo) pour déterminer la racine du projet.
  turbopack: {
    root: path.join(__dirname),
  },
  // Politique de cadre (anti-clickjacking) : posée à l'exécution dans proxy.ts, car elle dépend du
  // domaine (interdite partout, sauf EMBED_HOST et /admin pour le back office nwes).
};

export default nextConfig;
