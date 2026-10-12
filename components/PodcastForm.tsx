"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";

// Le bouton natif "Choisir un fichier" est stylé via le pseudo-élément
// `file:` pour ressembler à un vrai bouton (radius, contraste), au lieu du
// rendu par défaut du navigateur qui ressemble à un simple lien texte.
const fileInputClass =
  "text-sm text-text-muted file:mr-3 file:cursor-pointer file:rounded-[10px] file:border file:border-border file:bg-white file:px-4 file:py-2 file:text-sm file:font-semibold file:text-ink hover:file:bg-[#FAFAF8]";

interface FileRef {
  url: string;
  filename: string;
}

interface MediaFileRef extends FileRef {
  previewUrl?: string | null;
}

interface ExistingPodcast {
  cover: FileRef | null;
  intro: MediaFileRef | null;
  outro: MediaFileRef | null;
  logo: FileRef | null;
}

// Petite poubelle posée sur un média déjà enregistré : un clic demande confirmation sur place
// (pas de boîte de dialogue du navigateur), puis supprime le média du podcast et du stockage.
function DeleteMediaButton({ field, label }: { field: "cover" | "logo" | "intro" | "outro"; label: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function remove() {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch("/api/podcast/media", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="text-text-muted">{failed ? "Échec, réessaie." : `Supprimer ${label} ?`}</span>
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="rounded-pill bg-[#8A2E1F] px-2.5 py-1 font-semibold text-white disabled:opacity-50"
        >
          {busy ? "..." : "Supprimer"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={busy}
          className="rounded-pill border border-border bg-white px-2.5 py-1 font-semibold text-ink"
        >
          Annuler
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      aria-label={`Supprimer ${label}`}
      title={`Supprimer ${label}`}
      className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-white text-[#8A2E1F] shadow-sm transition hover:bg-[#FBEAE7]"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

function ImagePreview({ file }: { file: FileRef }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- fichier utilisateur servi dynamiquement (local ou signé), pas un asset buildé
    <img
      src={file.url}
      alt={file.filename}
      title={file.filename}
      className="h-20 w-20 rounded-md object-cover border border-border shrink-0"
    />
  );
}

function MediaPreview({ file }: { file: MediaFileRef }) {
  // Certains conteneurs/codecs uploadés tels quels (ex. .mov en HEVC/ProRes,
  // fréquent en export Apple) ne sont pas décodables par le <video> du
  // navigateur : le son est audible mais aucune image ne s'affiche
  // (videoWidth/videoHeight restent à 0). Un aperçu H.264/AAC est généré à
  // l'upload quand ffmpeg est disponible côté serveur (previewUrl), c'est
  // celui-là qu'on affiche en priorité. Sans lui (ffmpeg absent, ou fichier
  // déjà nativement lisible), on tente l'original, avec le même repli
  // honnête si le navigateur ne sait toujours pas le décoder.
  const [videoUnsupported, setVideoUnsupported] = useState(false);
  const src = file.previewUrl || file.url;

  if (videoUnsupported) {
    return (
      <div className="rounded-md border border-border bg-white px-3 py-2 text-xs text-text-muted">
        <p className="text-ink font-medium truncate" title={file.filename}>
          {file.filename}
        </p>
        <p className="mt-0.5">
          Aperçu vidéo indisponible dans ce navigateur (codec non supporté). Le fichier est bien enregistré.
        </p>
        <a href={file.url} download={file.filename} className="underline text-primary-button">
          Télécharger pour vérifier
        </a>
      </div>
    );
  }

  return (
    <video
      src={src}
      controls
      className="w-full max-h-[360px] rounded-md border border-border bg-black"
      onLoadedMetadata={(e) => {
        const v = e.currentTarget;
        if (v.videoWidth === 0 && v.videoHeight === 0) setVideoUnsupported(true);
      }}
      onError={() => setVideoUnsupported(true)}
    />
  );
}

// Étape 2 du parcours utilisateur : configuration du podcast. Réutilisé à la
// fois pour la création initiale (/podcast, aucun podcast existant) et pour
// la modification à tout moment (/podcast, podcast déjà configuré), un
// fichier non ré-uploadé lors d'une modification conserve sa valeur actuelle
// (cf. app/api/podcast/route.ts, upsert partiel).
// `fetch` ne donne aucun accès à la progression d'un upload : seul
// XMLHttpRequest expose `upload.onprogress`, nécessaire pour une vraie barre
// de progression sur des fichiers volumineux (générique en centaines de Mo).
function uploadWithProgress(
  url: string,
  form: FormData,
  onProgress: (percent: number) => void
): Promise<{ ok: boolean; status: number; json: () => Promise<{ error?: string }> }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        json: async () => {
          try {
            return JSON.parse(xhr.responseText);
          } catch {
            return {};
          }
        },
      });
    };
    xhr.onerror = () => reject(new Error("Erreur réseau."));
    xhr.send(form);
  });
}

export function PodcastForm({ existing }: { existing?: ExistingPodcast }) {
  const router = useRouter();
  // Capturé une seule fois au montage (cf. PodcastDnaForm, même raisonnement) :
  // reste vrai après le tout premier enregistrement, permettant de basculer
  // vers le dashboard "Épisodes" une seule fois, la toute première fois que
  // le graphisme est validé (fin du parcours de configuration du podcast).
  const [isFirstSave] = useState(!existing?.cover && !existing?.intro && !existing?.outro && !existing?.logo);
  const [loading, setLoading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setUploadPercent(0);
    setError(null);
    setSaved(false);

    const form = new FormData(e.currentTarget);

    let res;
    try {
      res = await uploadWithProgress("/api/podcast", form, setUploadPercent);
    } catch {
      setError("Erreur réseau, réessayez.");
      setLoading(false);
      setUploadPercent(null);
      return;
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: undefined }));
      setLoading(false);
      setUploadPercent(null);
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      setError(data.error || "Impossible d'enregistrer la configuration.");
      return;
    }

    setLoading(false);
    setUploadPercent(null);
    setSaved(true);
    if (isFirstSave) {
      router.push("/dashboard");
      return;
    }
    router.refresh();
  }

  const buttonLabel =
    uploadPercent !== null && uploadPercent < 100
      ? `Envoi... ${uploadPercent}%`
      : loading
        ? "Traitement en cours..."
        : "Enregistrer les modifications";

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {error && <p className="text-sm text-[#8A2E1F]">{error}</p>}
      {saved && <p className="text-sm text-[#0F6B67]">Configuration enregistrée.</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
        <div>
          <label className="block text-sm font-medium mb-1.5 text-ink">Pochette</label>
          <div className="space-y-2">
            {existing?.cover && (
              <div className="flex items-start gap-2">
                <ImagePreview file={existing.cover} />
                <DeleteMediaButton field="cover" label="la pochette" />
              </div>
            )}
            <input name="cover" type="file" accept="image/*" className={fileInputClass} />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5 text-ink">Logo permanent</label>
          <p className="text-xs text-text-muted mb-2">Incrusté en superposition sur chaque épisode monté.</p>
          <div className="space-y-2">
            {existing?.logo && (
              <div className="flex items-start gap-2">
                <ImagePreview file={existing.logo} />
                <DeleteMediaButton field="logo" label="le logo" />
              </div>
            )}
            <input name="logo" type="file" accept="image/*" className={fileInputClass} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
        <div>
          <label className="block text-sm font-medium mb-1.5 text-ink">Générique de début</label>
          <div className="space-y-2">
            {existing?.intro && (
              <div className="space-y-2">
                <MediaPreview file={existing.intro} />
                <DeleteMediaButton field="intro" label="le générique de début" />
              </div>
            )}
            <input name="intro" type="file" accept="video/*,audio/*" className={fileInputClass} />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5 text-ink">Générique de fin</label>
          <div className="space-y-2">
            {existing?.outro && (
              <div className="space-y-2">
                <MediaPreview file={existing.outro} />
                <DeleteMediaButton field="outro" label="le générique de fin" />
              </div>
            )}
            <input name="outro" type="file" accept="video/*,audio/*" className={fileInputClass} />
          </div>
        </div>
      </div>

      <Button type="submit" disabled={loading} className="w-full max-w-md">
        {buttonLabel}
      </Button>

      {loading && (
        <div className="h-1.5 w-full max-w-md rounded-pill bg-border overflow-hidden">
          <div
            className={`h-full bg-primary-button rounded-pill transition-[width] duration-200 ${
              uploadPercent === null || uploadPercent >= 100 ? "animate-pulse" : ""
            }`}
            style={{ width: `${uploadPercent === null ? 100 : Math.max(uploadPercent, 6)}%` }}
          />
        </div>
      )}
    </form>
  );
}
