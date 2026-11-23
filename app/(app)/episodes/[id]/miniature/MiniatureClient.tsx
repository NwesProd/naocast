"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { EPISODE_UPDATED_EVENT } from "@/components/SidebarNav";

interface Img {
  url: string;
  downloadUrl: string;
}
type Kind = "cover" | "thumbnail";

const pillBtn =
  "text-xs font-semibold rounded-pill bg-white border border-border px-3 py-1.5 hover:bg-[#FAFAF8] transition disabled:opacity-50 disabled:cursor-not-allowed";

const CONFIG: Record<Kind, { title: string; hint: string; ratio: string; box: string }> = {
  cover: {
    title: "Pochette audio",
    hint: "Image carrée, 1400 à 3000 pixels de côté (JPG ou PNG). Affichée sur Apple Podcasts, Spotify et Deezer.",
    ratio: "aspect-square",
    box: "max-w-[18rem]",
  },
  thumbnail: {
    title: "Miniature vidéo",
    hint: "Image au format 16:9, idéalement 1280 x 720 pixels (JPG ou PNG). Affichée sur YouTube.",
    ratio: "aspect-video",
    box: "max-w-[28rem]",
  },
};

// Mesure l'image avant l'envoi pour prévenir si elle ne respecte pas le format conseillé (sans bloquer).
function measure(file: File): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

function warning(kind: Kind, size: { w: number; h: number }): string | null {
  if (kind === "cover") {
    if (Math.abs(size.w - size.h) > 2) return `Cette image fait ${size.w} x ${size.h} : une pochette doit être carrée.`;
    if (size.w < 1400) return `Cette image fait ${size.w} pixels de côté : Apple demande au moins 1400.`;
    if (size.w > 3000) return `Cette image fait ${size.w} pixels de côté : Apple accepte au plus 3000.`;
    return null;
  }
  const ratio = size.w / size.h;
  if (Math.abs(ratio - 16 / 9) > 0.03) return `Cette image fait ${size.w} x ${size.h} : une miniature vidéo est au format 16:9.`;
  return null;
}

function Slot({ kind, episodeId, image, note }: { kind: Kind; episodeId: string; image: Img | null; note?: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [over, setOver] = useState(false);
  const cfg = CONFIG[kind];

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    const size = await measure(file);
    setWarn(size ? warning(kind, size) : null);
    try {
      const data = new FormData();
      data.set("kind", kind);
      data.set("file", file);
      const res = await fetch(`/api/episodes/${episodeId}/miniature`, { method: "POST", body: data });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Échec de l'envoi.");
      window.dispatchEvent(new Event(EPISODE_UPDATED_EVENT));
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/episodes/${episodeId}/miniature?kind=${kind}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Échec de la suppression.");
      setWarn(null);
      setConfirming(false);
      window.dispatchEvent(new Event(EPISODE_UPDATED_EVENT));
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className={`space-y-3 rounded-xl border bg-white p-5 transition ${over ? "border-primary-button ring-2 ring-primary-button/20" : "border-border"}`}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (!f || busy) return;
        if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) {
          setError("Format non pris en charge : dépose une image JPG, PNG ou WebP.");
          return;
        }
        upload(f);
      }}
    >
      <div>
        <h2 className="text-sm font-semibold text-ink">{cfg.title}</h2>
        <p className="mt-0.5 text-xs text-text-muted">{cfg.hint}</p>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
          e.target.value = "";
        }}
      />
      {image ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- image du stockage, adresse signée */}
          <img src={image.url} alt={cfg.title} className={`${cfg.ratio} ${cfg.box} w-full rounded-lg border border-border object-cover`} />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => input.current?.click()} className={pillBtn}>
              {busy ? "Envoi…" : "Remplacer"}
            </button>
            <a href={image.downloadUrl} className={pillBtn}>
              Télécharger
            </a>
            {confirming ? (
              <>
                <button type="button" disabled={busy} onClick={remove} className={`${pillBtn} !text-red-700`}>
                  Confirmer la suppression
                </button>
                <button type="button" onClick={() => setConfirming(false)} className={pillBtn}>
                  Annuler
                </button>
              </>
            ) : (
              <button type="button" disabled={busy} onClick={() => setConfirming(true)} className={pillBtn}>
                Supprimer
              </button>
            )}
          </div>
        </>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className={`${cfg.ratio} ${cfg.box} flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border-strong bg-[#FAFAF8] text-sm text-text-muted hover:bg-[#F4F1EC] transition`}
        >
          <span className="font-semibold text-ink">{busy ? "Envoi…" : over ? "Dépose l'image ici" : "Importer une image"}</span>
          <span className="text-xs">Clique ou glisse une image ici (JPG, PNG ou WebP)</span>
        </button>
      )}
      {note && !image && <p className="text-xs text-text-muted">{note}</p>}
      {warn && <p className="text-sm text-amber-800">{warn} Elle est enregistrée, mais le résultat peut être refusé ou mal cadré.</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}

export function MiniatureClient({
  episodeId,
  cover,
  thumbnail,
  podcastCoverUsed,
}: {
  episodeId: string;
  cover: Img | null;
  thumbnail: Img | null;
  podcastCoverUsed: boolean;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-ink">Miniature</h1>
        <p className="mt-0.5 text-sm text-text-muted">La miniature de la vidéo et la pochette de l&apos;audio de cet épisode.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Slot
          kind="cover"
          episodeId={episodeId}
          image={cover}
          note={podcastCoverUsed ? "Sans pochette propre, l'épisode utilise la pochette de ton podcast." : undefined}
        />
        <Slot kind="thumbnail" episodeId={episodeId} image={thumbnail} />
      </div>
    </div>
  );
}
