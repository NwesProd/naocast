"use client";

import { useState } from "react";

// Champ de mots clés en bulles : une virgule (ou Entrée) valide la bulle, la
// croix la retire, Retour arrière sur un champ vide retire la dernière.
export function TagInput({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState("");

  function commit(value: string) {
    const parts = value
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    const next = [...tags];
    for (const part of parts) {
      if (!next.some((t) => t.toLowerCase() === part.toLowerCase())) next.push(part.slice(0, 40));
    }
    if (next.length !== tags.length) onChange(next);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-white px-2 py-1.5">
      {tags.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-full bg-sky px-2.5 py-0.5 text-xs text-sky-ink">
          {t}
          <button type="button" onClick={() => onChange(tags.filter((x) => x !== t))} className="text-sky-muted hover:text-[#8A2E1F]" title="Retirer ce mot clé" aria-label={`Retirer ${t}`}>
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        onChange={(e) => {
          const v = e.target.value;
          if (v.includes(",")) {
            commit(v);
            setDraft("");
          } else {
            setDraft(v);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(draft);
            setDraft("");
          } else if (e.key === "Backspace" && !draft && tags.length > 0) {
            onChange(tags.slice(0, -1));
          }
        }}
        onBlur={() => {
          commit(draft);
          setDraft("");
        }}
        placeholder={tags.length === 0 ? "Ex. entrepreneuriat, IA, marketing" : ""}
        className="min-w-[8rem] flex-1 bg-transparent py-0.5 text-sm outline-none"
      />
    </div>
  );
}
