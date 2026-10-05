"use client";

import { OPEN_FEEDBACK_EVENT } from "@/components/FeedbackWidget";

// Bouton qui ouvre le module Feedback (en bas à droite).
export function OpenFeedbackButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_FEEDBACK_EVENT))}
      className="shrink-0 rounded-[10px] bg-primary-button px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
    >
      {children}
    </button>
  );
}
