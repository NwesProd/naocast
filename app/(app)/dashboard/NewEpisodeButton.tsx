"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";

export function NewEpisodeButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    const res = await fetch("/api/episodes", { method: "POST" });
    if (!res.ok) {
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
    <Button onClick={handleClick} disabled={loading}>
      {loading ? "..." : "+ Ajouter un épisode"}
    </Button>
  );
}
