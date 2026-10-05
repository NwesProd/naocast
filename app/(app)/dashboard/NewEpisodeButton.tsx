"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { EPISODE_UPDATED_EVENT } from "@/components/SidebarNav";

export function NewEpisodeButton({ label = "+ Ajouter un épisode", align = "end" }: { label?: string; align?: "start" | "end" } = {}) {
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
    // La sidebar (layout persistant, cf. PlanUsageCard) a son propre fetch
    // déclenché par cet événement, sans quoi son compteur resterait affiché
    // à sa valeur d'avant cette création (constaté en conditions réelles).
    window.dispatchEvent(new Event(EPISODE_UPDATED_EVENT));
    router.push(`/episodes/${episode.id}/new`);
  }

  return (
    <div className={`flex flex-col gap-2 ${align === "end" ? "items-end" : "items-start"}`}>
      <Button onClick={handleClick} disabled={loading}>
        {loading ? "..." : label}
      </Button>
      {error && (
        <p className={`text-xs text-[#8A2E1F] max-w-xs ${align === "end" ? "text-right" : ""}`}>
          {error} <a href="/billing" className="underline font-semibold">Voir les forfaits</a>
        </p>
      )}
    </div>
  );
}
