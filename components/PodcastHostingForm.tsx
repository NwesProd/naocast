"use client";

import { useEffect, useRef, useState } from "react";
import { CATEGORIES, LANGUAGES } from "@/lib/rssConstants";

export interface HostingValues {
  author: string;
  ownerEmail: string;
  description: string;
  language: string;
  category: string;
  explicit: boolean;
  website: string;
}

const field = "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:border-primary-button";
const label = "block text-xs font-semibold text-text-muted mb-1";

// Informations du podcast demandées par Apple, Spotify et Deezer pour le flux RSS (le titre et la pochette
// existent déjà ailleurs). Enregistrement automatique à chaque modification.
export function PodcastHostingForm({ initial, onSaved }: { initial: HostingValues; onSaved?: (missing: string[]) => void }) {
  const [v, setV] = useState<HostingValues>(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const first = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setState("saving");
      try {
        const res = await fetch("/api/podcast/hosting", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v) });
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error || "Échec de l'enregistrement.");
        setError(null);
        setState("saved");
        onSaved?.(body.missing ?? []);
      } catch (err) {
        setError((err as Error).message);
        setState("error");
      }
    }, 700);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);

  const set = <K extends keyof HostingValues>(k: K, value: HostingValues[K]) => setV((prev) => ({ ...prev, [k]: value }));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Auteur ou nom affiché</label>
          <input className={field} value={v.author} onChange={(e) => set("author", e.target.value)} placeholder="Amandine Juste" />
        </div>
        <div>
          <label className={label}>E-mail du propriétaire</label>
          <input className={field} type="email" value={v.ownerEmail} onChange={(e) => set("ownerEmail", e.target.value)} placeholder="nom@exemple.com" />
          <p className="mt-1 text-xs text-text-muted">Exigé par Apple, jamais affiché au public.</p>
        </div>
      </div>
      <div>
        <label className={label}>Description du podcast</label>
        <textarea className={`${field} min-h-[88px]`} value={v.description} onChange={(e) => set("description", e.target.value)} placeholder="De quoi parle ton podcast, pour qui ?" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className={label}>Langue</label>
          <select className={field} value={v.language} onChange={(e) => set("language", e.target.value)}>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Catégorie</label>
          <select className={field} value={v.category} onChange={(e) => set("category", e.target.value)}>
            <option value="">Choisir…</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Contenu explicite</label>
          <select className={field} value={v.explicit ? "yes" : "no"} onChange={(e) => set("explicit", e.target.value === "yes")}>
            <option value="no">Non</option>
            <option value="yes">Oui</option>
          </select>
        </div>
      </div>
      <div>
        <label className={label}>Site web (facultatif)</label>
        <input className={field} value={v.website} onChange={(e) => set("website", e.target.value)} placeholder="https://" />
      </div>
      <p className="text-xs text-text-muted h-4" aria-live="polite">
        {state === "saving" && "Enregistrement…"}
        {state === "saved" && "Enregistré"}
        {state === "error" && <span className="text-red-600">{error}</span>}
      </p>
    </div>
  );
}
