"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const KINDS = [
  { key: "BUG", label: "Un bug", icon: "🐞" },
  { key: "IDEA", label: "Une idée", icon: "💡" },
  { key: "OTHER", label: "Autre chose", icon: "💬" },
] as const;

type Kind = (typeof KINDS)[number]["key"];

// Petit module de feedback, en bas à droite de toutes les pages de l'app : un bug, une
// idée ou autre chose. La page d'où l'utilisateur écrit est jointe automatiquement.
export const OPEN_FEEDBACK_EVENT = "naocast:open-feedback";

export function FeedbackWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("BUG");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ouvert aussi depuis ailleurs dans l'app (ex. bandeau "Donner mon avis" du dashboard).
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_FEEDBACK_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_FEEDBACK_EVENT, onOpen);
  }, []);

  function close() {
    setOpen(false);
    if (sent) {
      setSent(false);
      setMessage("");
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, message, pageUrl: `${pathname}${window.location.search}` }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Impossible d'envoyer, réessaie.");
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3">
      {open && (
        <div className="w-[340px] max-w-[calc(100vw-2.5rem)] rounded-2xl border border-border bg-white p-4 shadow-xl" role="dialog" aria-label="Feedback">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-ink">Un bug, une idée ?</p>
            <button type="button" onClick={close} aria-label="Fermer" className="text-text-muted hover:text-ink px-1">
              ×
            </button>
          </div>

          {sent ? (
            <div className="py-6 text-center space-y-2">
              <p className="text-2xl">🧡</p>
              <p className="text-sm font-medium text-ink">Merci, c&apos;est bien reçu !</p>
              <p className="text-xs text-text-muted">On lit tout, et on revient vers toi si besoin.</p>
              <button type="button" onClick={close} className="mt-2 text-sm font-semibold underline text-primary-button">
                Fermer
              </button>
            </div>
          ) : (
            <form onSubmit={send} className="mt-3 space-y-3">
              <div className="flex flex-wrap gap-2">
                {KINDS.map((k) => (
                  <button
                    key={k.key}
                    type="button"
                    onClick={() => setKind(k.key)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                      kind === k.key ? "border-primary-button bg-primary-button text-white" : "border-border bg-white text-ink hover:bg-[#FAFAF8]"
                    }`}
                  >
                    <span aria-hidden="true">{k.icon}</span> {k.label}
                  </button>
                ))}
              </div>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={2000}
                rows={4}
                required
                aria-label="Ton message"
                placeholder="Dis-nous tout : la page d'où tu écris est jointe automatiquement."
                className="w-full resize-none rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-button/30"
              />
              {error && <p className="text-xs text-[#8A2E1F]">{error}</p>}
              <button
                type="submit"
                disabled={sending || message.trim().length < 3}
                className="w-full rounded-[10px] bg-primary-button px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
              >
                {sending ? "Envoi..." : "Envoyer"}
              </button>
            </form>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        className="flex items-center gap-2 rounded-full bg-primary-button px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:brightness-110"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4V5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M12 7v5M9.5 9.5h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        Feedback
      </button>
    </div>
  );
}
