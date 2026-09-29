"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { EPISODE_UPDATED_EVENT } from "@/components/SidebarNav";

const inputClass = "rounded-md border border-border bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-button/30";

interface EpisodeInfo {
  title: string | null;
  season: number | null;
  episodeNumber: number | null;
  releaseDate: string | null; // format "YYYY-MM-DD", pour <input type="date">
}

// Page d'informations de l'épisode (titre obligatoire, saison/n°/date
// facultatifs), atteinte en créant un épisode ou en cliquant dessus depuis
// la liste "Épisodes". La sidebar (cf. SidebarNav) détecte qu'on est sur
// /episodes/[id]/* et "sélectionne" cet épisode, ce qui déverrouille l'onglet
// "Montage". À la création, l'enregistrement ouvre directement ce tunnel de
// montage ; en modification (titre déjà renseigné), on reste sur place.
export function EpisodeInfoForm({
  episodeId,
  initialInfo,
  suggestedInfo,
}: {
  episodeId: string;
  initialInfo: EpisodeInfo;
  suggestedInfo?: { season: number | null; episodeNumber: number | null } | null;
}) {
  const router = useRouter();
  const isNew = !initialInfo.title;
  const [title, setTitle] = useState(initialInfo.title || "");
  const [season, setSeason] = useState(
    initialInfo.season?.toString() || suggestedInfo?.season?.toString() || ""
  );
  const [episodeNumber, setEpisodeNumber] = useState(
    initialInfo.episodeNumber?.toString() || suggestedInfo?.episodeNumber?.toString() || ""
  );
  const [releaseDate, setReleaseDate] = useState(initialInfo.releaseDate || "");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setTitleError("Le titre est obligatoire.");
      return;
    }
    setTitleError(null);
    setError(null);
    setSaved(false);
    setSaving(true);

    const res = await fetch(`/api/episodes/${episodeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        ...(season.trim() && { season: Number(season) }),
        ...(episodeNumber.trim() && { episodeNumber: Number(episodeNumber) }),
        ...(releaseDate && { releaseDate }),
      }),
    });

    setSaving(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: undefined }));
      setError(data.error || "Impossible d'enregistrer les informations de l'épisode.");
      return;
    }

    window.dispatchEvent(new Event(EPISODE_UPDATED_EVENT));
    if (isNew) {
      router.push(`/episodes/${episodeId}/montage`);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="text-sm text-[#8A2E1F]">{error}</p>}
      {saved && <p className="text-sm text-[#0F6B67]">Enregistré.</p>}

      <div>
        <label className="block text-sm font-medium mb-1 text-ink">Titre *</label>
        <input
          type="text"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (titleError) setTitleError(null);
          }}
          className={`w-full ${inputClass}`}
          placeholder="Ex. Épisode 12 : le monde du podcast"
        />
        {titleError && <p className="text-xs text-[#8A2E1F] mt-1">{titleError}</p>}
      </div>

      <div className="flex gap-4">
        <div>
          <label className="block text-sm font-medium mb-1 text-ink">Saison</label>
          <input
            type="number"
            min={1}
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            className={`${inputClass} w-28`}
            placeholder="Optionnel"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-ink">N° d&apos;épisode</label>
          <input
            type="number"
            min={1}
            value={episodeNumber}
            onChange={(e) => setEpisodeNumber(e.target.value)}
            className={`${inputClass} w-28`}
            placeholder="Optionnel"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1 text-ink">Date de sortie</label>
        <input
          type="date"
          value={releaseDate}
          onChange={(e) => setReleaseDate(e.target.value)}
          className={inputClass}
        />
      </div>

      <Button type="submit" disabled={saving}>
        {saving ? "Enregistrement..." : isNew ? "Créer l'épisode" : "Enregistrer"}
      </Button>
    </form>
  );
}
