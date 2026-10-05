"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { GlassModal } from "@/components/GlassModal";
import { SocialBadge, SOCIAL_PLATFORMS } from "@/components/SocialBadge";
import { TagInput } from "@/components/TagInput";

interface SocialLink {
  platform: string;
  url: string;
}

export interface PoolGuestRow {
  id: string;
  name: string;
  mediaName: string | null;
  tags: string[];
  socialLinks: SocialLink[];
  episodeCount: number;
}

const fieldClass =
  "w-full rounded-2xl border border-white/80 bg-white/80 px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-button/30";
const labelClass = "mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted";
const pillBtn =
  "rounded-full border border-border bg-white px-3.5 py-1.5 text-xs font-semibold text-ink transition hover:bg-[#FAFAF8] disabled:opacity-50";

// Encart "Mon pool d'invités" du dashboard : le pool du podcast (partagé entre tous les épisodes) pour
// repérer, ajouter et retrouver des invités potentiels, même sans épisode en cours.
export function GuestPool({ initialGuests, hasAccess }: { initialGuests: PoolGuestRow[]; hasAccess: boolean }) {
  const [guests, setGuests] = useState<PoolGuestRow[]>(initialGuests);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Formulaire d'ajout
  const [name, setName] = useState("");
  const [media, setMedia] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return guests;
    return guests.filter((g) => `${g.name} ${g.mediaName ?? ""} ${g.tags.join(" ")}`.toLowerCase().includes(q));
  }, [guests, query]);

  function openPool(startAdding = false) {
    setOpen(true);
    setAdding(startAdding);
    setError(null);
  }

  function resetForm() {
    setName("");
    setMedia("");
    setTags([]);
    setLinks({});
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    const socialLinks = SOCIAL_PLATFORMS.map((p) => ({ platform: p.key, url: (links[p.key] || "").trim() })).filter((l) => l.url);
    try {
      const res = await fetch("/api/podcast/guests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), mediaName: media.trim() || null, socialLinks, tags }),
      });
      if (!res.ok) throw new Error();
      const g = await res.json();
      setGuests((list) =>
        [...list, { id: g.id, name: g.name, mediaName: g.mediaName, tags: g.tags ?? tags, socialLinks, episodeCount: 0 }].sort((a, b) =>
          a.name.localeCompare(b.name, "fr")
        )
      );
      resetForm();
      setAdding(false);
    } catch {
      setError("Impossible d'ajouter l'invité, réessaie.");
    } finally {
      setSaving(false);
    }
  }

  async function update(id: string, data: Partial<Pick<PoolGuestRow, "name" | "mediaName" | "tags" | "socialLinks">>) {
    setGuests((list) => list.map((g) => (g.id === id ? { ...g, ...data } : g)));
    try {
      const res = await fetch(`/api/podcast/guests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error();
    } catch {
      setError("Impossible d'enregistrer la modification.");
    }
  }

  async function remove(id: string) {
    setError(null);
    const res = await fetch(`/api/podcast/guests/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Impossible de supprimer l'invité.");
      return;
    }
    setGuests((list) => list.filter((g) => g.id !== id));
    setDeletingId(null);
  }

  const preview = guests.slice(0, 5);

  return (
    <section className="rounded-xl bg-sky p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-sky-muted">Mon pool d&apos;invités</p>
          <p className="mt-1 text-2xl font-bold text-sky-ink">
            {guests.length} <span className="text-base font-medium">invité{guests.length > 1 ? "s" : ""} en réserve</span>
          </p>
          {hasAccess ? (
            <p className="mt-1 text-sm text-sky-muted">Garde sous la main ceux que tu voudrais recevoir, avec leurs mots clés.</p>
          ) : (
            <p className="mt-1 text-sm text-sky-muted">
              Réservé à naocast infinity et lifetime.{" "}
              <Link href="/billing" className="font-semibold underline">
                Voir les forfaits
              </Link>
            </p>
          )}
        </div>
        {hasAccess && (
          <div className="flex gap-2">
            <button type="button" onClick={() => openPool(false)} className="rounded-[10px] bg-white px-4 py-2 text-sm font-semibold text-sky-ink transition hover:bg-white/80">
              Ouvrir le pool
            </button>
            <button type="button" onClick={() => openPool(true)} className="rounded-[10px] bg-primary-button px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110">
              + Ajouter un invité
            </button>
          </div>
        )}
      </div>

      {hasAccess && preview.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {preview.map((g) => (
            <span key={g.id} className="rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-sky-ink">
              {g.name}
            </span>
          ))}
          {guests.length > preview.length && <span className="px-1 py-1 text-xs text-sky-muted">+ {guests.length - preview.length}</span>}
        </div>
      )}

      <GlassModal
        open={open}
        onClose={() => setOpen(false)}
        title="Mon pool d'invités"
        subtitle="Partagé entre tous tes épisodes. Ajoute-les ici, retrouve-les au moment de composer ton casting."
        width="max-w-2xl"
        footer={
          !adding ? (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="rounded-full bg-primary-button px-6 py-2.5 text-sm font-semibold text-white shadow-md transition hover:brightness-110"
            >
              + Ajouter un invité
            </button>
          ) : undefined
        }
      >
        <div className="space-y-4 pt-2">
          {error && <p className="rounded-2xl bg-[#FBEAE7] px-4 py-2.5 text-sm text-[#8A2E1F]">{error}</p>}

          {adding && (
            <form onSubmit={add} className="space-y-3 rounded-3xl bg-white/70 p-4 shadow-sm">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="pool-name" className={labelClass}>
                    Nom *
                  </label>
                  <input id="pool-name" value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} placeholder="Prénom Nom" autoFocus />
                </div>
                <div>
                  <label htmlFor="pool-media" className={labelClass}>
                    Média / entreprise
                  </label>
                  <input id="pool-media" value={media} onChange={(e) => setMedia(e.target.value)} className={fieldClass} placeholder="Optionnel" />
                </div>
              </div>
              <div>
                <label className={labelClass}>Mots clés</label>
                <TagInput tags={tags} onChange={setTags} />
              </div>
              <div className="space-y-2">
                <label className={labelClass}>Réseaux</label>
                {SOCIAL_PLATFORMS.map((p) => (
                  <div key={p.key} className="flex items-center gap-2">
                    <SocialBadge platformKey={p.key} size="md" />
                    <input
                      type="url"
                      value={links[p.key] || ""}
                      onChange={(e) => setLinks((l) => ({ ...l, [p.key]: e.target.value }))}
                      placeholder={`Lien ${p.label}`}
                      className={fieldClass}
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => { setAdding(false); resetForm(); }} className="rounded-full px-4 py-2 text-sm font-semibold text-text-muted hover:text-ink">
                  Annuler
                </button>
                <button type="submit" disabled={!name.trim() || saving} className="rounded-full bg-primary-button px-6 py-2 text-sm font-semibold text-white shadow-md transition hover:brightness-110 disabled:opacity-50">
                  {saving ? "Ajout..." : "Ajouter au pool"}
                </button>
              </div>
            </form>
          )}

          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher par nom, média ou mot clé..."
            aria-label="Rechercher dans le pool"
            className={fieldClass}
          />

          {guests.length === 0 ? (
            <p className="rounded-3xl bg-white/60 p-6 text-center text-sm text-text-muted">Ton pool est vide. Ajoute les personnes que tu aimerais recevoir.</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-text-muted">Aucun invité ne correspond.</p>
          ) : (
            <ul className="space-y-2">
              {filtered.map((g) => (
                <li key={g.id} className="rounded-3xl bg-white/70 p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink">
                        {g.name}
                        {g.mediaName && <span className="font-normal text-text-muted"> · {g.mediaName}</span>}
                      </p>
                      <p className="text-xs text-text-muted">
                        {g.episodeCount === 0 ? "Pas encore invité" : `Sur ${g.episodeCount} épisode${g.episodeCount > 1 ? "s" : ""}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {g.socialLinks.map((l) => (
                        <a key={l.platform} href={l.url} target="_blank" rel="noreferrer">
                          <SocialBadge platformKey={l.platform} />
                        </a>
                      ))}
                      <button type="button" onClick={() => setEditingId(editingId === g.id ? null : g.id)} className={pillBtn}>
                        {editingId === g.id ? "Fermer" : "Modifier"}
                      </button>
                    </div>
                  </div>

                  {g.tags.length > 0 && editingId !== g.id && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {g.tags.map((t) => (
                        <span key={t} className="rounded-full bg-sky px-2.5 py-0.5 text-xs text-sky-ink">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}

                  {editingId === g.id && (
                    <div className="mt-3 space-y-3 border-t border-border/60 pt-3">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className={labelClass}>Nom</label>
                          <input defaultValue={g.name} onBlur={(e) => e.target.value.trim() && update(g.id, { name: e.target.value.trim() })} className={fieldClass} />
                        </div>
                        <div>
                          <label className={labelClass}>Média / entreprise</label>
                          <input defaultValue={g.mediaName ?? ""} onBlur={(e) => update(g.id, { mediaName: e.target.value.trim() || null })} className={fieldClass} />
                        </div>
                      </div>
                      <div>
                        <label className={labelClass}>Mots clés</label>
                        <TagInput tags={g.tags} onChange={(next) => update(g.id, { tags: next })} />
                      </div>
                      <div className="space-y-2">
                        <label className={labelClass}>Réseaux</label>
                        {SOCIAL_PLATFORMS.map((p) => (
                          <div key={p.key} className="flex items-center gap-2">
                            <SocialBadge platformKey={p.key} size="md" />
                            <input
                              type="url"
                              defaultValue={g.socialLinks.find((l) => l.platform === p.key)?.url ?? ""}
                              placeholder={`Lien ${p.label}`}
                              className={fieldClass}
                              onBlur={(e) => {
                                const url = e.target.value.trim();
                                const others = g.socialLinks.filter((l) => l.platform !== p.key);
                                update(g.id, { socialLinks: url ? [...others, { platform: p.key, url }] : others });
                              }}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        {deletingId === g.id ? (
                          <span className="flex items-center gap-2 text-xs text-[#8A2E1F]">
                            Supprimer {g.name}
                            {g.episodeCount > 0 ? ` (retiré de ${g.episodeCount} épisode${g.episodeCount > 1 ? "s" : ""})` : ""} ?
                            <button type="button" onClick={() => remove(g.id)} className="rounded-full bg-[#8A2E1F] px-3 py-1 text-xs font-semibold text-white">
                              Oui, supprimer
                            </button>
                            <button type="button" onClick={() => setDeletingId(null)} className="font-semibold underline">
                              Annuler
                            </button>
                          </span>
                        ) : (
                          <button type="button" onClick={() => setDeletingId(g.id)} className="text-xs font-semibold text-[#8A2E1F] hover:underline">
                            Supprimer du pool
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </GlassModal>
    </section>
  );
}
