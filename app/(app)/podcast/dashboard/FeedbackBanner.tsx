"use client";

import { useSyncExternalStore } from "react";
import { OpenFeedbackButton } from "@/components/OpenFeedbackButton";

const STORAGE_KEY = "naocast.feedbackBanner.hiddenUntil";
const HIDE_DAYS = 7;

const listeners = new Set<() => void>();
let hiddenThisSession = false; // repli quand le navigateur n'a pas de stockage

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Masqué tant que « Plus tard » est actif ; côté serveur (et avant l'hydratation) l'encart
// reste masqué pour éviter un affichage qui clignote.
function isHidden(): boolean {
  if (hiddenThisSession) return true;
  try {
    return Date.now() < Number(localStorage.getItem(STORAGE_KEY) || 0);
  } catch {
    return false;
  }
}

// Invitation à donner son avis (dashboard du podcast). « Plus tard » la masque 7 jours
// sur cet appareil (simple confort d'affichage, stocké dans le navigateur).
export function FeedbackBanner() {
  const hidden = useSyncExternalStore(subscribe, isHidden, () => true);

  function hideForLater() {
    hiddenThisSession = true;
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now() + HIDE_DAYS * 24 * 60 * 60 * 1000));
    } catch {
      // navigateur sans stockage : masqué jusqu'au prochain rechargement
    }
    listeners.forEach((l) => l());
  }

  if (hidden) return null;

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-white px-5 py-3">
      <p className="flex items-center gap-3 text-sm text-ink">
        <span className="text-lg" aria-hidden="true">
          🎁
        </span>
        <span>
          Un bug, une idée, une envie ? <strong>Dis-nous ce qui t&apos;aiderait</strong> : on lit tout, et ça fait avancer naocast.
        </span>
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <button type="button" onClick={hideForLater} className="text-sm font-semibold text-text-muted hover:text-ink">
          Plus tard
        </button>
        <OpenFeedbackButton>Donner mon avis</OpenFeedbackButton>
      </div>
    </div>
  );
}
