"use client";

import { useEffect, useState } from "react";

// Progression simulée pour les générations sans signal de progression réel
// (un seul appel API, Claude, Whisper...), contrairement au rendu ffmpeg
// (cf. IntroClient.tsx) qui a une vraie progression rapportée par le serveur.
// Grimpe vite au début puis ralentit en s'approchant du plafond, sans jamais
// l'atteindre tant que `active` reste vrai, pour ne jamais laisser croire que
// c'est fini avant que la réponse arrive vraiment. Revient à 0 dès que
// `active` repasse à faux, prêt pour la prochaine génération.
export function useSimulatedProgress(active: boolean, ceiling = 95): number {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!active) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProgress(0);
      return;
    }
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= ceiling) return p;
        const step = Math.max(1, Math.round((ceiling - p) / 12));
        return Math.min(ceiling, p + step);
      });
    }, 200);
    return () => clearInterval(interval);
  }, [active, ceiling]);

  return progress;
}
