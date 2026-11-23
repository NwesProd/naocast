// Infobulle au survol (CSS, sans dépendance) : les infobulles natives du navigateur n'apparaissent pas
// partout (page affichée dans un cadre, délai long, pas de survol au toucher). L'enfant reste affiché tel quel.
export function HoverTip({ text, children, className = "" }: { text: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`group relative ${className}`}>
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-20 mt-1 hidden whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs font-medium text-white group-hover:block"
      >
        {text}
      </span>
    </div>
  );
}
