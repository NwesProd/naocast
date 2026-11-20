"use client";

import { useEffect, useState } from "react";
import { OpenFeedbackButton } from "@/components/OpenFeedbackButton";

const STORAGE_KEY = "naocast.feedbackBanner.hiddenUntil";
const HIDE_DAYS = 7;

// Invitation à donner son avis (dashboard du podcast). « Plus tard » la masque 7 jours
// sur cet appareil (simple confort d'affichage, stocké dans le navigateur).
export function FeedbackBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const until = Number(localStorage.getItem(STORAGE_KEY) || 0);
      setVisible(Date.now() >= until);
    } catch {
      setVisible(true);
    }
  }, []);

  function hideForLater() {
    setVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now() + HIDE_DAYS * 24 * 60 * 60 * 1000));
    } catch {
      // navigateur sans stockage : l'encart reviendra au prochain affichage
    }
  }

  if (!visible) return null;

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
