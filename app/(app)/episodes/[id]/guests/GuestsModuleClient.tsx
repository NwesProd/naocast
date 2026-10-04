"use client";

import { useEffect, useState } from "react";
import { FaInstagram, FaLinkedin, FaYoutube } from "react-icons/fa6";
import type { IconType } from "react-icons";
import { useSimulatedProgress } from "@/lib/useSimulatedProgress";
import { EPISODE_UPDATED_EVENT } from "@/components/SidebarNav";

interface SocialLink {
  platform: string;
  url: string;
}

interface Guest {
  id: string;
  name: string;
  mediaName: string | null;
  socialLinks: SocialLink[];
  tags: string[];
}

interface EpisodeGuestItem {
  id: string; // id de l'EpisodeGuest (le rattachement), pas du Guest
  guest: Guest;
}

interface PoolGuest extends Guest {
  lastAppearanceAt: string | null;
  alreadyAdded: boolean;
  // Mots clés de l'invité présents dans le script de l'épisode (invité remonté en tête).
  relevantTags: string[];
}

const pillBtn =
  "text-xs font-semibold rounded-pill bg-white border border-border px-3 py-1.5 hover:bg-[#FAFAF8] transition disabled:opacity-50 disabled:cursor-not-allowed";
const inputCls = "w-full rounded-md border border-border bg-white px-3 py-2 text-sm";
const labelCls = "block text-xs font-medium text-text-muted mb-1";

// Réseaux proposés pour les liens d'un invité, liste fermée volontairement
// courte (les plus utiles en pratique) plutôt qu'un champ libre par lien.
const SOCIAL_PLATFORMS: { key: string; label: string }[] = [
  { key: "instagram", label: "Instagram" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "youtube", label: "YouTube" },
];

// Vraies icônes de marque (react-icons/fa6) plutôt que des tracés dessinés à
// la main, netteté garantie à toutes les tailles, contrairement à des SVG
// approximatifs reconstruits de mémoire.
const SOCIAL_ICON_COMPONENTS: Record<string, IconType> = {
  instagram: FaInstagram,
  linkedin: FaLinkedin,
  youtube: FaYoutube,
};
const SOCIAL_ICON_COLORS: Record<string, string> = {
  instagram: "#E1306C",
  linkedin: "#0A66C2",
  youtube: "#FF0000",
};

function SocialBadge({ platformKey, size = "sm" }: { platformKey: string; size?: "sm" | "md" }) {
  const platform = SOCIAL_PLATFORMS.find((p) => p.key === platformKey);
  const Icon = SOCIAL_ICON_COMPONENTS[platformKey];
  const dim = size === "sm" ? 20 : 24;
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center"
      style={{ width: dim, height: dim }}
      title={platform?.label || platformKey}
    >
      {Icon ? (
        <Icon size={dim} color={SOCIAL_ICON_COLORS[platformKey]} />
      ) : (
        <span className="h-full w-full flex items-center justify-center bg-white border border-border text-[10px] font-bold text-ink rounded-md">
          ?
        </span>
      )}
    </span>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "Jamais apparu";
  return `Dernière apparition : ${new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}`;
}

// Module "Invités" (catégorie Prod) : gérer les invités de l'épisode, soit
// réutilisés depuis le pool du podcast (partagé entre tous les épisodes),
// soit créés à la volée, et générer le message à leur envoyer.
export function GuestsModuleClient({
  episodeId,
  initialEpisodeGuests,
  initialGuestMessage,
  initialBroadcastMessage,
  initialCastingValidated,
}: {
  episodeId: string;
  initialEpisodeGuests: EpisodeGuestItem[];
  initialGuestMessage: string;
  initialBroadcastMessage: string;
  initialCastingValidated: boolean;
}) {
  const [episodeGuests, setEpisodeGuests] = useState<EpisodeGuestItem[]>(initialEpisodeGuests);
  const [expandedGuestId, setExpandedGuestId] = useState<string | null>(null);
  const [addingPlatformFor, setAddingPlatformFor] = useState<string | null>(null);
  const [newPlatform, setNewPlatform] = useState(SOCIAL_PLATFORMS[0].key);
  const [newPlatformUrl, setNewPlatformUrl] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newMedia, setNewMedia] = useState("");
  const [newTags, setNewTags] = useState<string[]>([]);
  const [newSocialLinks, setNewSocialLinks] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);

  const [poolGuests, setPoolGuests] = useState<PoolGuest[]>([]);
  const [poolQuery, setPoolQuery] = useState("");
  const [poolLoading, setPoolLoading] = useState(false);

  const [castingValidated, setCastingValidated] = useState(initialCastingValidated);
  const [validatingCasting, setValidatingCasting] = useState(false);

  const [error, setError] = useState<string | null>(null);

  function loadPool(query: string) {
    setPoolLoading(true);
    const params = new URLSearchParams({ episodeId });
    if (query) params.set("q", query);
    fetch(`/api/podcast/guests?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: PoolGuest[]) => setPoolGuests(data))
      .catch(() => setError("Échec du chargement du pool d'invités."))
      .finally(() => setPoolLoading(false));
  }

  // Recharge le pool à la frappe (debounce léger), évite une requête par
  // caractère tapé dans la recherche.
  useEffect(() => {
    const t = setTimeout(() => loadPool(poolQuery), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolQuery]);

  function markPoolAdded(guestId: string) {
    setPoolGuests((gs) => gs.map((g) => (g.id === guestId ? { ...g, alreadyAdded: true } : g)));
  }

  async function addFromPool(guest: PoolGuest) {
    setError(null);
    try {
      const res = await fetch(`/api/episodes/${episodeId}/guests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestId: guest.id }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      markPoolAdded(guest.id);
      setEpisodeGuests((eg) => [
        ...eg,
        { id: data.id, guest: { id: guest.id, name: guest.name, mediaName: guest.mediaName, socialLinks: guest.socialLinks, tags: guest.tags } },
      ]);
      // Déplié direct, formulaire réseau déjà ouvert : l'utilisateur vient de
      // choisir cet invité, autant lui montrer tout de suite où renseigner
      // ses réseaux plutôt que de lui faire chercher la flèche puis le bouton.
      setExpandedGuestId(guest.id);
      if (guest.socialLinks.length === 0) {
        setNewPlatform(SOCIAL_PLATFORMS[0].key);
        setNewPlatformUrl("");
        setAddingPlatformFor(guest.id);
      }
    } catch {
      setError("Échec de l'ajout de l'invité à l'épisode.");
    }
  }

  async function createGuest() {
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    const socialLinks = SOCIAL_PLATFORMS.map((p) => ({ platform: p.key, url: (newSocialLinks[p.key] || "").trim() })).filter(
      (l) => l.url
    );
    try {
      const res = await fetch(`/api/podcast/guests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), mediaName: newMedia.trim() || null, socialLinks, tags: newTags, episodeId }),
      });
      if (!res.ok) throw new Error();
      const guest = await res.json();
      setEpisodeGuests((eg) => [...eg, { id: `${guest.id}-pending`, guest: { ...guest, socialLinks, tags: newTags } }]);
      setNewName("");
      setNewMedia("");
      setNewTags([]);
      setNewSocialLinks({});
      setShowAddForm(false);
      loadPool(poolQuery);
    } catch {
      setError("Échec de la création de l'invité.");
    } finally {
      setCreating(false);
    }
  }

  async function removeFromEpisode(episodeGuestId: string) {
    setError(null);
    const prev = episodeGuests;
    setEpisodeGuests((eg) => eg.filter((e) => e.id !== episodeGuestId));
    try {
      const res = await fetch(`/api/episodes/${episodeId}/guests/${episodeGuestId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      loadPool(poolQuery);
    } catch {
      setEpisodeGuests(prev);
      setError("Échec du retrait de l'invité.");
    }
  }

  async function updateGuest(guestId: string, data: { name?: string; mediaName?: string | null; socialLinks?: SocialLink[]; tags?: string[] }) {
    setEpisodeGuests((eg) =>
      eg.map((e) => (e.guest.id === guestId ? { ...e, guest: { ...e.guest, ...data } as Guest } : e))
    );
    try {
      const res = await fetch(`/api/podcast/guests/${guestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error();
      // Les mots clés changent la pertinence : on recalcule l'ordre du pool.
      if (data.tags !== undefined) loadPool(poolQuery);
    } catch {
      setError("Échec de l'enregistrement de l'invité.");
    }
  }

  function removeSocialLink(guest: Guest, platform: string) {
    updateGuest(guest.id, { socialLinks: guest.socialLinks.filter((l) => l.platform !== platform) });
  }

  function startAddPlatform(guest: Guest) {
    const available = SOCIAL_PLATFORMS.filter((p) => !guest.socialLinks.some((l) => l.platform === p.key));
    if (available.length === 0) return;
    setNewPlatform(available[0].key);
    setNewPlatformUrl("");
    setAddingPlatformFor(guest.id);
  }

  function confirmAddPlatform(guest: Guest) {
    if (!newPlatformUrl.trim()) return;
    updateGuest(guest.id, { socialLinks: [...guest.socialLinks, { platform: newPlatform, url: newPlatformUrl.trim() }] });
    setAddingPlatformFor(null);
    setNewPlatformUrl("");
  }

  async function toggleCastingValidated() {
    const next = !castingValidated;
    setValidatingCasting(true);
    setError(null);
    try {
      const res = await fetch(`/api/episodes/${episodeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestsCastingValidated: next }),
      });
      if (!res.ok) throw new Error();
      setCastingValidated(next);
      window.dispatchEvent(new Event(EPISODE_UPDATED_EVENT));
    } catch {
      setError("Échec de la validation du casting.");
    } finally {
      setValidatingCasting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-ink">Invités</h1>
        <button
          type="button"
          onClick={toggleCastingValidated}
          disabled={validatingCasting}
          className={`text-sm font-semibold rounded-[10px] px-4 py-2 transition disabled:opacity-50 ${
            castingValidated ? "bg-accent-teal text-white" : "bg-primary-button text-white hover:brightness-110"
          }`}
        >
          {validatingCasting ? "..." : castingValidated ? "✓ Casting validé" : "Valider le casting"}
        </button>
      </div>

      {error && <p className="text-sm text-[#8A2E1F]">{error}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Invités de l'épisode */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-ink text-sm">Invités de l&apos;épisode</h2>
            <button type="button" onClick={() => setShowAddForm((v) => !v)} className={pillBtn}>
              + Ajouter un invité
            </button>
          </div>

          {showAddForm && (
            <div className="rounded-xl bg-mint p-4 space-y-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nom"
                className={inputCls}
              />
              <input
                type="text"
                value={newMedia}
                onChange={(e) => setNewMedia(e.target.value)}
                placeholder="Nom du média / entreprise (optionnel)"
                className={inputCls}
              />
              <div>
                <label className={labelCls}>Mots clés (optionnel)</label>
                <TagInput tags={newTags} onChange={setNewTags} />
              </div>
              <div className="space-y-2 pt-1">
                <label className={labelCls}>Réseaux (optionnel)</label>
                {SOCIAL_PLATFORMS.map((p) => (
                  <div key={p.key} className="flex items-center gap-2">
                    <SocialBadge platformKey={p.key} size="md" />
                    <input
                      type="url"
                      value={newSocialLinks[p.key] || ""}
                      onChange={(e) => setNewSocialLinks((links) => ({ ...links, [p.key]: e.target.value }))}
                      placeholder={`Lien ${p.label}`}
                      className={`${inputCls} flex-1`}
                    />
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={createGuest}
                  disabled={!newName.trim() || creating}
                  className="text-sm font-semibold rounded-[10px] bg-primary-button text-white px-4 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {creating ? "Ajout..." : "Ajouter"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setNewSocialLinks({});
                    setNewTags([]);
                  }}
                  className={pillBtn}
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          {episodeGuests.length === 0 && !showAddForm && (
            <p className="text-sm text-text-muted rounded-xl bg-mint p-4">Aucun invité pour le moment.</p>
          )}

          <ul className="space-y-2">
            {episodeGuests.map((eg) => {
              const expanded = expandedGuestId === eg.guest.id;
              const availablePlatforms = SOCIAL_PLATFORMS.filter(
                (p) => !eg.guest.socialLinks.some((l) => l.platform === p.key)
              );
              return (
                <li key={eg.id} className="rounded-xl bg-white border border-border p-3">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setExpandedGuestId(expanded ? null : eg.guest.id)}
                      className="shrink-0 text-text-muted hover:text-ink"
                      title="Déplier / replier les liens réseaux"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        className={`transition-transform ${expanded ? "rotate-90" : ""}`}
                      >
                        <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink truncate">
                        {eg.guest.name}
                        {eg.guest.mediaName && <span className="text-text-muted font-normal"> - {eg.guest.mediaName}</span>}
                      </p>
                    </div>
                    {eg.guest.socialLinks.length > 0 && (
                      <div className="flex items-center gap-1 shrink-0">
                        {eg.guest.socialLinks.map((l) => (
                          <a key={l.platform} href={l.url} target="_blank" rel="noreferrer">
                            <SocialBadge platformKey={l.platform} />
                          </a>
                        ))}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => removeFromEpisode(eg.id)}
                      className="shrink-0 text-text-muted hover:text-[#8A2E1F] p-1"
                      title="Retirer de cet épisode"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>

                  {expanded && (
                    <div className="mt-3 pl-7 space-y-3 border-t border-border pt-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className={labelCls}>Nom</label>
                          <input
                            type="text"
                            defaultValue={eg.guest.name}
                            onBlur={(e) => updateGuest(eg.guest.id, { name: e.target.value })}
                            className={inputCls}
                          />
                        </div>
                        <div>
                          <label className={labelCls}>Nom du média / entreprise</label>
                          <input
                            type="text"
                            defaultValue={eg.guest.mediaName || ""}
                            onBlur={(e) => updateGuest(eg.guest.id, { mediaName: e.target.value || null })}
                            className={inputCls}
                          />
                        </div>
                      </div>

                      <div>
                        <label className={labelCls}>Mots clés</label>
                        <TagInput tags={eg.guest.tags} onChange={(tags) => updateGuest(eg.guest.id, { tags })} />
                        <p className="text-xs text-text-muted mt-1">
                          Une virgule valide le mot clé. Les invités dont les mots clés apparaissent dans le script remontent en tête du pool.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <label className={labelCls}>Réseaux</label>
                        {eg.guest.socialLinks.map((l) => (
                          <div key={l.platform} className="flex items-center gap-2">
                            <SocialBadge platformKey={l.platform} size="md" />
                            <a
                              href={l.url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex-1 truncate text-sm text-accent-teal hover:underline"
                            >
                              {l.url}
                            </a>
                            <button
                              type="button"
                              onClick={() => removeSocialLink(eg.guest, l.platform)}
                              className="shrink-0 text-text-muted hover:text-[#8A2E1F] p-1"
                              title="Retirer ce réseau"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                              </svg>
                            </button>
                          </div>
                        ))}

                        {addingPlatformFor === eg.guest.id ? (
                          <div className="flex items-center gap-2">
                            <select
                              value={newPlatform}
                              onChange={(e) => setNewPlatform(e.target.value)}
                              className="rounded-md border border-border bg-white px-2 py-2 text-sm"
                            >
                              {availablePlatforms.map((p) => (
                                <option key={p.key} value={p.key}>
                                  {p.label}
                                </option>
                              ))}
                            </select>
                            <input
                              type="url"
                              value={newPlatformUrl}
                              onChange={(e) => setNewPlatformUrl(e.target.value)}
                              placeholder="https://..."
                              className={`${inputCls} flex-1`}
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => confirmAddPlatform(eg.guest)}
                              disabled={!newPlatformUrl.trim()}
                              className={pillBtn}
                            >
                              Ajouter
                            </button>
                            <button type="button" onClick={() => setAddingPlatformFor(null)} className={pillBtn}>
                              Annuler
                            </button>
                          </div>
                        ) : (
                          availablePlatforms.length > 0 && (
                            <button type="button" onClick={() => startAddPlatform(eg.guest)} className={pillBtn}>
                              + Ajouter un réseau
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {/* Pool d'invités */}
        <div className="lg:col-span-1 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-medium text-ink text-sm">Pool d&apos;invités</h2>
          </div>
          <div className="relative">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              value={poolQuery}
              onChange={(e) => setPoolQuery(e.target.value)}
              placeholder="Rechercher un invité..."
              className={`${inputCls} pl-8`}
            />
          </div>

          {/* 4 invités visibles à la fois, le reste défile */}
          <div className="max-h-[328px] space-y-2 overflow-y-auto pr-1">
            {poolLoading && <p className="text-xs text-text-muted">Chargement...</p>}
            {!poolLoading && poolGuests.length === 0 && (
              <p className="text-xs text-text-muted">Aucun invité dans le pool pour le moment.</p>
            )}
            {poolGuests.map((g) => (
              <div key={g.id} className="h-[76px] rounded-xl bg-sky p-3 flex items-start justify-between gap-2 overflow-hidden">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-sky-ink truncate">
                    {g.name}
                    {g.mediaName && <span className="text-sky-muted font-normal"> - {g.mediaName}</span>}
                  </p>
                  {g.relevantTags.length > 0 ? (
                    <p className="text-xs text-sky-ink truncate" title="Mots clés présents dans le script">
                      <span className="font-semibold">Pertinent</span> : {g.relevantTags.join(", ")}
                    </p>
                  ) : (
                    <p className="text-xs text-sky-muted truncate">{formatDate(g.lastAppearanceAt)}</p>
                  )}
                  {g.tags.length > 0 && (
                    <div className="mt-1 flex gap-1 overflow-hidden">
                      {g.tags.slice(0, 4).map((t) => (
                        <span
                          key={t}
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] leading-none ${
                            g.relevantTags.includes(t) ? "bg-white font-semibold text-sky-ink" : "bg-white/50 text-sky-muted"
                          }`}
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {g.alreadyAdded ? (
                  <span className="shrink-0 text-accent-teal" title="Déjà ajouté à cet épisode">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => addFromPool(g)}
                    title="Ajouter l'invité à l'épisode"
                    className="shrink-0 h-6 w-6 rounded-full bg-white border border-border flex items-center justify-center text-ink hover:bg-[#FAFAF8]"
                  >
                    +
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <MessageCard title="Message d'info" endpoint={`/api/episodes/${episodeId}/guest-message`} field="guestMessage" initialMessage={initialGuestMessage} onError={setError} />

      {/* Annonce de la sortie aux invités et consignes pour la relayer. */}
      <MessageCard
        title="Message diffusion"
        endpoint={`/api/episodes/${episodeId}/guest-broadcast-message`}
        field="guestBroadcastMessage"
        initialMessage={initialBroadcastMessage}
        onError={setError}
      />
    </div>
  );
}

// Encart de message généré (message d'info, message diffusion) : bouton de
// génération, texte modifiable, copie dans le presse-papier.
function MessageCard({
  title,
  endpoint,
  field,
  initialMessage,
  onError,
}: {
  title: string;
  endpoint: string;
  field: "guestMessage" | "guestBroadcastMessage";
  initialMessage: string;
  onError: (message: string | null) => void;
}) {
  const [message, setMessage] = useState(initialMessage);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const progress = useSimulatedProgress(generating);

  async function generate() {
    setGenerating(true);
    onError(null);
    try {
      const res = await fetch(endpoint, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Échec de la génération du message.");
      }
      const data = await res.json();
      setMessage(data[field] || "");
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: message }),
      });
      if (!res.ok) throw new Error();
    } catch {
      onError("Échec de l'enregistrement du message.");
    } finally {
      setSaving(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onError("Échec de la copie dans le presse-papier.");
    }
  }

  return (
    <div className="rounded-xl bg-mint p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-medium text-mint-ink text-sm">{title}</h2>
        {message && (
          <button type="button" onClick={copy} title="Copier le message" className="rounded-md border border-border bg-white p-2 text-ink hover:bg-[#FAFAF8] transition">
            {copied ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M5 13l4 4L19 7" stroke="#0F6B67" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <rect x="9" y="9" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="2" />
                <path d="M5 15V6a1.5 1.5 0 0 1 1.5-1.5H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            )}
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={generate}
        disabled={generating}
        className="text-sm font-semibold rounded-[10px] bg-primary-button text-white px-4 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {generating ? `Génération en cours... ${progress}%` : message ? "Régénérer le message" : "Générer le message"}
      </button>

      {message && (
        <div className="space-y-2">
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={10} className={`${inputCls} bg-white`} />
          <button type="button" onClick={save} disabled={saving} className={pillBtn}>
            {saving ? "Enregistrement..." : "Modifier"}
          </button>
        </div>
      )}
    </div>
  );
}

// Champ de mots clés en bulles : une virgule (ou Entrée) valide la bulle, la
// croix la retire, Retour arrière sur un champ vide retire la dernière.
function TagInput({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
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
