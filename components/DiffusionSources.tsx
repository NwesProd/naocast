"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const pillBtn =
  "text-xs font-semibold rounded-pill bg-white border border-border px-3 py-1.5 hover:bg-[#FAFAF8] transition disabled:opacity-50 disabled:cursor-not-allowed";
const inputClass = "w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-button/30";

// Onglet « Sources de diffusion » de Mon podcast : la chaîne YouTube dont naocast lit les statistiques
// publiques (module Diffusion). Les hébergeurs audio viendront ensuite.
export function DiffusionSources({ channelTitle }: { channelTitle: string | null }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/podcast/youtube", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "Connexion impossible.");
      setUrl("");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/podcast/youtube", { method: "DELETE" });
    if (!res.ok) setError("Déconnexion impossible.");
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section className="space-y-3 rounded-xl border border-border bg-white p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">YouTube</h2>
          {channelTitle && <span className="rounded-pill bg-[#DDEFE3] px-2.5 py-0.5 text-xs font-semibold text-[#1F5C3A]">Connectée</span>}
        </div>
        {channelTitle ? (
          <>
            <p className="text-sm text-ink">{channelTitle}</p>
            <button type="button" onClick={disconnect} disabled={busy} className={pillBtn}>
              Déconnecter la chaîne
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-text-muted">Colle l&apos;adresse de ta chaîne. Les vues, likes et commentaires de chaque vidéo sont publics : aucune connexion à ton compte Google.</p>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && url.trim() && connect()}
              placeholder="youtube.com/@mapodcast"
              className={inputClass}
            />
            <button type="button" onClick={connect} disabled={busy || !url.trim()} className={pillBtn}>
              {busy ? "Connexion..." : "Connecter ma chaîne"}
            </button>
          </>
        )}
        {error && <p className="text-sm text-[#8A2E1F]">{error}</p>}
      </section>

      <section className="space-y-2 rounded-xl border border-border bg-[#FAFAF8] p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">Hébergeur audio</h2>
          <span className="rounded-pill bg-white px-2.5 py-0.5 text-xs font-semibold text-text-muted">Bientôt</span>
        </div>
        <p className="text-sm text-text-muted">Les écoutes se lisent chez ton hébergeur audio : Apple Podcasts et Spotify ne donnent pas leurs chiffres à l&apos;extérieur.</p>
      </section>
    </div>
  );
}
