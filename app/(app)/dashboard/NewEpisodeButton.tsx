"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";

export function NewEpisodeButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/episodes", { method: "POST" });
    if (!res.ok) {
      if (res.status === 403) {
        const data = await res.json().catch(() => ({ error: undefined }));
        setError(data.error || "Limite du forfait atteinte.");
        setLoading(false);
        return;
      }
      // Ne devrait pas arriver via l'UI (le dashboard redirige déjà vers
      // /podcast tant qu'aucun podcast n'existe), mais reste possible en cas
      // de course (podcast supprimé dans un autre onglet, session expirée...).
      router.push("/podcast");
      return;
    }
    const episode = await res.json();
    router.push(`/episodes/${episode.id}/new`);
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button onClick={handleClick} disabled={loading}>
        {loading ? "..." : "+ Ajouter un épisode"}
      </Button>
      {error && (
        <p className="text-xs text-[#8A2E1F] max-w-xs text-right">
          {error} <a href="/billing" className="underline font-semibold">Voir les forfaits</a>
        </p>
      )}
    </div>
  );
}
