"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { GlassModal } from "@/components/GlassModal";
import { EPISODE_UPDATED_EVENT } from "@/components/SidebarNav";

const fieldClass =
  "w-full rounded-2xl border border-white/80 bg-white/80 px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-button/30";
const labelClass = "mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted";

// "Ajouter un épisode" : une fenêtre pour renseigner l'essentiel (titre obligatoire, saison, numéro,
// date de sortie), puis l'épisode est créé et on arrive directement dans son tunnel de montage.
export function NewEpisodeButton({ label = "+ Ajouter un épisode", align = "end" }: { label?: string; align?: "start" | "end" } = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [season, setSeason] = useState("");
  const [episodeNumber, setEpisodeNumber] = useState("");
  const [releaseDate, setReleaseDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  // Épisode déjà créé si l'enregistrement des infos a échoué : on réessaie sans en créer un second.
  const [createdId, setCreatedId] = useState<string | null>(null);

  // À l'ouverture : saison de l'épisode précédent et numéro suivant en suggestion.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/episodes")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: { season: number | null; episodeNumber: number | null }[]) => {
        const previous = list[0];
        if (cancelled || !previous) return;
        setSeason((s) => s || (previous.season != null ? String(previous.season) : ""));
        setEpisodeNumber((n) => n || (previous.episodeNumber != null ? String(previous.episodeNumber + 1) : ""));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  function close() {
    if (saving) return;
    setOpen(false);
    setError(null);
    setLimitReached(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Le titre est obligatoire.");
      return;
    }
    setSaving(true);
    setError(null);
    setLimitReached(false);
    try {
      let id = createdId;
      if (!id) {
        const res = await fetch("/api/episodes", { method: "POST" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: undefined }));
          if (res.status === 403) {
            setLimitReached(true);
            throw new Error(data.error || "Limite du forfait atteinte.");
          }
          throw new Error("Impossible de créer l'épisode, réessaie.");
        }
        id = (await res.json()).id as string;
        setCreatedId(id);
      }

      const info = await fetch(`/api/episodes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          ...(season.trim() && { season: Number(season) }),
          ...(episodeNumber.trim() && { episodeNumber: Number(episodeNumber) }),
          ...(releaseDate && { releaseDate }),
        }),
      });
      if (!info.ok) throw new Error("Impossible d'enregistrer les informations, réessaie.");

      // La sidebar a son propre état (compteur du forfait, épisode sélectionné) : on la prévient.
      window.dispatchEvent(new Event(EPISODE_UPDATED_EVENT));
      router.push(`/episodes/${id}/montage`);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className={`flex flex-col gap-2 ${align === "end" ? "items-end" : "items-start"}`}>
      <Button onClick={() => setOpen(true)}>{label}</Button>

      <GlassModal
        open={open}
        onClose={close}
        title="Nouvel épisode"
        subtitle="Quelques infos pour démarrer, tu pourras tout modifier ensuite."
        width="max-w-md"
        footer={
          <>
            <button type="button" onClick={close} disabled={saving} className="rounded-full px-4 py-2 text-sm font-semibold text-text-muted hover:text-ink disabled:opacity-50">
              Annuler
            </button>
            <button
              type="submit"
              form="new-episode-form"
              disabled={saving}
              className="rounded-full bg-primary-button px-6 py-2.5 text-sm font-semibold text-white shadow-md transition hover:brightness-110 disabled:opacity-60"
            >
              {saving ? "Création..." : "Créer l'épisode"}
            </button>
          </>
        }
      >
        <form id="new-episode-form" onSubmit={submit} className="space-y-4 pt-2">
          {error && (
            <p className="rounded-2xl bg-[#FBEAE7] px-4 py-2.5 text-sm text-[#8A2E1F]">
              {error}{" "}
              {limitReached && (
                <a href="/billing" className="font-semibold underline">
                  Voir les forfaits
                </a>
              )}
            </p>
          )}
          <div>
            <label htmlFor="ep-title" className={labelClass}>
              Titre *
            </label>
            <input
              id="ep-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex. Épisode 12 : le monde du podcast"
              className={fieldClass}
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="ep-season" className={labelClass}>
                Saison
              </label>
              <input id="ep-season" type="number" min={1} value={season} onChange={(e) => setSeason(e.target.value)} placeholder="Optionnel" className={fieldClass} />
            </div>
            <div>
              <label htmlFor="ep-number" className={labelClass}>
                N° d&apos;épisode
              </label>
              <input id="ep-number" type="number" min={1} value={episodeNumber} onChange={(e) => setEpisodeNumber(e.target.value)} placeholder="Optionnel" className={fieldClass} />
            </div>
          </div>
          <div>
            <label htmlFor="ep-date" className={labelClass}>
              Date de sortie
            </label>
            <input id="ep-date" type="date" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} className={fieldClass} />
          </div>
        </form>
      </GlassModal>
    </div>
  );
}
