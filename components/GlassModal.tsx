"use client";

import { useEffect, useRef } from "react";

// Fenêtre modale "verre dépoli" : fond flouté, carte translucide très arrondie, titre à
// gauche et croix ronde à droite. Se ferme avec Échap, un clic à côté, ou la croix.
export function GlassModal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // Pas de défilement de la page derrière la fenêtre.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/25 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[90vh] w-full ${width} flex-col overflow-hidden rounded-[28px] border border-white/70 bg-white/85 shadow-[0_24px_80px_rgba(40,30,20,0.25)] backdrop-blur-xl outline-none`}
      >
        <div className="flex items-start justify-between gap-4 px-7 pt-6 pb-3">
          <div>
            <h2 className="text-xl font-bold text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-text-muted">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-ink shadow-sm transition hover:bg-[#FAFAF8]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-7 pb-5">{children}</div>
        {footer && <div className="flex items-center justify-end gap-3 border-t border-white/70 bg-white/60 px-7 py-4">{footer}</div>}
      </div>
    </div>
  );
}
