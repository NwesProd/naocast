"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { EPISODE_UPDATED_EVENT } from "@/components/SidebarNav";
import { uploadFinalDirect, uploadRushDirect } from "@/lib/directUpload";

type Choice = "NEED_EDITOR" | "HAS_EDITOR_SEND" | "CLAUDE";

interface Rush {
  id: string;
  filename: string;
  durationSec: number | null;
  sizeBytes: number | null;
  ready: boolean;
}
interface FinalFile {
  url: string;
  downloadUrl: string;
}

const pillBtn =
  "text-xs font-semibold rounded-pill bg-white border border-border px-3 py-1.5 hover:bg-[#FAFAF8] transition disabled:opacity-50 disabled:cursor-not-allowed";
const primaryBtn =
  "text-sm font-semibold rounded-[10px] bg-primary-button text-white px-4 py-2 hover:brightness-110 transition disabled:opacity-50 disabled:cursor-not-allowed";
const inputClass = "w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-button/30";

function formatSize(bytes: number | null): string {
  if (bytes === null) return "";
  return bytes < 1024 * 1024 * 1024 ? `${Math.max(1, Math.round(bytes / (1024 * 1024)))} Mo` : `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} Go`;
}

function formatDuration(sec: number | null): string {
  if (!sec) return "";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

const optionCardClass = "rounded-xl border border-border bg-white p-4 text-left transition hover:bg-[#FAFAF8]";

function OptionCard({ selected, onClick, title, description, disabled }: { selected: boolean; onClick: () => void; title: string; description: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={`rounded-xl border p-4 text-left transition disabled:opacity-60 disabled:cursor-not-allowed ${
        selected ? "border-primary-button bg-peach/40" : "border-border bg-white hover:bg-[#FAFAF8]"
      }`}
    >
      <p className="text-sm font-semibold text-ink">{title}</p>
      <p className="mt-1 text-xs text-text-muted">{description}</p>
    </button>
  );
}

// Module « Montage » : choisir la voie (monteur naocast, monteur personnel ou Claude), importer
// les rushs, déposer la vidéo finale montée ailleurs, la visionner, la valider puis la télécharger
// (vidéo, et audio extrait de la vidéo).
export function MontageClient({
  episodeId,
  status,
  editorChoice,
  ownEditorEmail,
  initialNotes,
  editingPaid,
  paymentReturn,
  rushes,
  video,
  audio,
}: {
  episodeId: string;
  status: string;
  editorChoice: string | null;
  ownEditorEmail: string | null;
  initialNotes: string;
  editingPaid: boolean;
  paymentReturn: string | null;
  rushes: Rush[];
  video: FinalFile | null;
  audio: FinalFile | null; // extrait de la vidéo finale
}) {
  const router = useRouter();
  const validated = status === "EXPORTED";
  const processing = status === "QUEUED" || status === "PROCESSING";
  const hasFinal = !!video;
  const serverChoice: Choice | null = editorChoice === "NEED_EDITOR" || editorChoice === "HAS_EDITOR_SEND" || editorChoice === "CLAUDE" ? editorChoice : null;
  // Le choix s'affiche tout de suite (avant la réponse du serveur) : pas d'ancien choix qui réapparaît le temps du rechargement.
  const [localChoice, setLocalChoice] = useState<Choice | null>(serverChoice);
  const choice = localChoice;

  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState(initialNotes);
  const [email, setEmail] = useState(ownEditorEmail ?? "");
  const [ownNotes, setOwnNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null); // "rush" | "video"
  const [uploadPercent, setUploadPercent] = useState(0);
  const [changingChoice, setChangingChoice] = useState(false);
  const confirmedPayment = useRef(false);

  // Retour de Stripe Checkout : vérifie le paiement auprès du serveur, puis recharge la page.
  useEffect(() => {
    if (!paymentReturn || confirmedPayment.current) return;
    confirmedPayment.current = true;
    fetch(`/api/episodes/${episodeId}/editing-request/confirm?session_id=${encodeURIComponent(paymentReturn)}`)
      .catch(() => {})
      .finally(() => {
        window.dispatchEvent(new Event(EPISODE_UPDATED_EVENT));
        router.replace(`/episodes/${episodeId}/montage`);
        router.refresh();
      });
  }, [paymentReturn, episodeId, router]);

  // Extraction de l'audio en cours : la page se rafraîchit toute seule jusqu'à la fin.
  useEffect(() => {
    if (!processing) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [processing, router]);

  async function patchEditorChoice(value: Choice) {
    const previous = localChoice;
    setError(null);
    setLocalChoice(value);
    setChangingChoice(false);
    try {
      const res = await fetch(`/api/episodes/${episodeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editorChoice: value }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      setLocalChoice(previous);
      setError("Impossible d'enregistrer ce choix.");
    }
  }

  async function uploadRush(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading("rush");
    try {
      for (const file of Array.from(files)) {
        setUploadPercent(0);
        const direct = await uploadRushDirect(episodeId, file, (sent) => setUploadPercent(Math.round((sent / file.size) * 100)));
        if (direct === null) {
          const form = new FormData();
          form.append("file", file);
          const res = await fetch(`/api/episodes/${episodeId}/rushes`, { method: "POST", body: form });
          if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "Échec de l'envoi du rush.");
        }
      }
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(null);
    }
  }

  async function removeRush(rushId: string) {
    setError(null);
    const res = await fetch(`/api/episodes/${episodeId}/rushes/${rushId}`, { method: "DELETE" });
    if (!res.ok) setError("Impossible de supprimer ce rush.");
    router.refresh();
  }

  async function uploadFinal(file: File | undefined) {
    if (!file) return;
    setError(null);
    setUploading("video");
    setUploadPercent(0);
    try {
      const direct = await uploadFinalDirect(episodeId, file, (sent) => setUploadPercent(Math.round((sent / file.size) * 100)));
      if (direct === null) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(`/api/episodes/${episodeId}/final`, { method: "POST", body: form });
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "Échec du dépôt du fichier.");
      }
      window.dispatchEvent(new Event(EPISODE_UPDATED_EVENT));
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(null);
    }
  }

  async function sendToNaocastEditor() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/episodes/${episodeId}/editing-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.url) throw new Error(data?.error || "Impossible de lancer le paiement.");
      window.location.href = data.url;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function sendToOwnEditor() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/episodes/${episodeId}/send-to-own-editor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, notes: ownNotes }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "Envoi impossible.");
      window.dispatchEvent(new Event(EPISODE_UPDATED_EVENT));
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function setValidation(next: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/episodes/${episodeId}/validate`, { method: next ? "POST" : "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "Action impossible.");
      window.dispatchEvent(new Event(EPISODE_UPDATED_EVENT));
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }


  const editorSent = status === "HUMAN_EDITOR_REQUESTED";
  const finalPhase = validated || hasFinal || processing || status === "FAILED";
  // Départ (rien d'importé) : rushs ou épisode final ; une fois des rushs importés, on choisit la voie de montage.
  const showStart = !finalPhase && rushes.length === 0 && !editorSent;
  const inRushFlow = !finalPhase && (rushes.length > 0 || editorSent);
  const showChoice = inRushFlow && (!choice || changingChoice) && !editorSent;

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-bold text-ink">Montage</h1>

      {error && <p className="text-sm text-[#8A2E1F]">{error}</p>}

      {/* 1. Départ : importer les rushs ou l'épisode final */}
      {showStart && (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className={`${optionCardClass} cursor-pointer`}>
            <p className="text-sm font-semibold text-ink">{uploading === "rush" ? `Envoi... ${uploadPercent}%` : "Importer mes rushs"}</p>
            <p className="mt-1 text-xs text-text-muted">Les fichiers bruts de l&apos;enregistrement. Tu choisis ensuite comment les faire monter.</p>
            <input type="file" multiple accept="video/*,audio/*" className="hidden" disabled={uploading !== null} onChange={(e) => { uploadRush(e.target.files); e.target.value = ""; }} />
          </label>
          <label className={`${optionCardClass} cursor-pointer`}>
            <p className="text-sm font-semibold text-ink">{uploading === "video" ? `Envoi... ${uploadPercent}%` : "Importer mon épisode final"}</p>
            <p className="mt-1 text-xs text-text-muted">Ton épisode est déjà monté : dépose la vidéo, naocast en extrait l&apos;audio.</p>
            <input type="file" accept="video/*" className="hidden" disabled={uploading !== null} onChange={(e) => { uploadFinal(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
        </section>
      )}

      {/* 2. Rushs importés, puis choix de la voie de montage et action propre à cette voie */}
      {inRushFlow && (
        <>
          <section className="space-y-3 rounded-xl border border-border bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-ink">Rushs de l&apos;épisode</h2>
              {!editorSent && (
                <label className={`${pillBtn} cursor-pointer`}>
                  {uploading === "rush" ? `Envoi... ${uploadPercent}%` : "+ Importer des rushs"}
                  <input type="file" multiple accept="video/*,audio/*" className="hidden" disabled={uploading !== null} onChange={(e) => { uploadRush(e.target.files); e.target.value = ""; }} />
                </label>
              )}
            </div>
            {choice === "CLAUDE" && <p className="text-sm text-text-muted">Importe ici tes rushs pour que Claude y ait accès facilement.</p>}
            <ul className="divide-y divide-border rounded-md border border-border text-sm">
              {rushes.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0 truncate text-ink">{r.filename}</span>
                  <span className="flex shrink-0 items-center gap-3 text-xs text-text-muted">
                    {[formatDuration(r.durationSec), formatSize(r.sizeBytes)].filter(Boolean).join(" · ")}
                    {!editorSent && (
                      <button type="button" onClick={() => removeRush(r.id)} className="text-[#8A2E1F] underline">
                        Retirer
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {showChoice && (
            <section className="space-y-3 rounded-xl border border-border bg-white p-5">
              <h2 className="text-sm font-semibold text-ink">Comment veux-tu monter cet épisode ?</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <OptionCard selected={choice === "NEED_EDITOR"} onClick={() => patchEditorChoice("NEED_EDITOR")} title="Monteur naocast" description="Un monteur de l'équipe s'occupe de tout." />
                <OptionCard selected={choice === "HAS_EDITOR_SEND"} onClick={() => patchEditorChoice("HAS_EDITOR_SEND")} title="Mon monteur" description="Tu envoies les rushs et tes consignes à ton propre monteur." />
                <OptionCard selected={choice === "CLAUDE"} onClick={() => patchEditorChoice("CLAUDE")} title="Monter avec Claude" description="Tu montes l'épisode toi-même avec Claude, à partir de tes fichiers." />
              </div>
            </section>
          )}

          {!showChoice && choice && (
            <section className="space-y-4 rounded-xl border border-border bg-white p-5">
              <p className="text-sm text-text-muted">
                Voie choisie : <strong className="text-ink">{choice === "NEED_EDITOR" ? "monteur naocast" : choice === "HAS_EDITOR_SEND" ? "mon monteur" : "Claude"}</strong>
                {!editorSent && (
                  <button type="button" onClick={() => setChangingChoice(true)} className={`${pillBtn} ml-2`}>
                    Changer
                  </button>
                )}
              </p>

              {choice === "NEED_EDITOR" &&
                (editorSent ? (
                  <p className="rounded-md bg-mint p-3 text-sm text-mint-ink">{editingPaid ? "Demande envoyée et payée : l'équipe s'occupe du montage. Tu pourras déposer le résultat ci-dessous." : "Demande envoyée."}</p>
                ) : (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-ink">Tes consignes pour le monteur</label>
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} maxLength={5000} placeholder="Ce qu'il faut couper, le ton, les génériques à utiliser..." className={inputClass} />
                    <button type="button" onClick={sendToNaocastEditor} disabled={busy} className={primaryBtn}>
                      {busy ? "Redirection vers le paiement..." : "Envoyer au monteur naocast"}
                    </button>
                  </div>
                ))}

              {choice === "HAS_EDITOR_SEND" &&
                (editorSent ? (
                  <p className="rounded-md bg-mint p-3 text-sm text-mint-ink">Envoyé à {ownEditorEmail}. Dès que ton monteur te rend l&apos;épisode, dépose-le ci-dessous.</p>
                ) : (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-ink">Email de ton monteur</label>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="monteur@exemple.com" className={inputClass} />
                    <label className="block pt-1 text-sm font-medium text-ink">Tes consignes pour le monteur</label>
                    <textarea value={ownNotes} onChange={(e) => setOwnNotes(e.target.value)} rows={4} maxLength={5000} placeholder="Ce qu'il faut couper, le ton, les génériques à utiliser..." className={inputClass} />
                    <button type="button" onClick={sendToOwnEditor} disabled={busy || !email.trim()} className={primaryBtn}>
                      {busy ? "Envoi..." : "Envoyer à mon monteur"}
                    </button>
                  </div>
                ))}
            </section>
          )}
        </>
      )}

      {/* 3. Vidéo finale : dépôt */}
      {!validated && (editorSent || hasFinal || processing || status === "FAILED") && (
        <section className="space-y-3 rounded-xl border border-border bg-white p-5">
          <h2 className="text-sm font-semibold text-ink">Épisode final</h2>
          {processing ? (
            <p className="text-sm text-text-muted">Extraction de l&apos;audio en cours, quelques instants...</p>
          ) : status === "FAILED" ? (
            <p className="text-sm text-[#8A2E1F]">Le traitement du fichier a échoué. Dépose-le de nouveau.</p>
          ) : null}
          <p className="text-sm text-text-muted">
            {video ? "Tu peux remplacer la vidéo déposée." : "Dès que le montage est fini, dépose ici la vidéo finale : naocast en extrait l'audio, que tu pourras télécharger aussi."}
          </p>
          <label className={`${pillBtn} inline-block cursor-pointer`}>
            {uploading === "video" ? `Envoi... ${uploadPercent}%` : video ? "Remplacer la vidéo" : "Déposer la vidéo finale"}
            <input type="file" accept="video/*" className="hidden" disabled={uploading !== null} onChange={(e) => { uploadFinal(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
        </section>
      )}

      {/* 4. Visionnage, validation, téléchargement */}
      {hasFinal && !processing && (
        <section className="space-y-4 rounded-xl border border-border bg-white p-5">
          <h2 className="text-sm font-semibold text-ink">{validated ? "Épisode validé" : "À relire avant validation"}</h2>
          {video && <video src={video.url} controls className="w-full max-h-[480px] rounded-md border border-border bg-black" />}

          {validated ? (
            <div className="flex flex-wrap items-center gap-2">
              {video && (
                <a href={video.downloadUrl} download className={primaryBtn}>
                  Télécharger la vidéo
                </a>
              )}
              {audio && (
                <a href={audio.downloadUrl} download className={primaryBtn}>
                  Télécharger l&apos;audio
                </a>
              )}
              <button type="button" onClick={() => setValidation(false)} disabled={busy} className="ml-2 text-xs text-text-muted underline">
                Retirer la validation
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              <button type="button" onClick={() => setValidation(true)} disabled={busy} className={primaryBtn}>
                {busy ? "..." : "Valider le montage"}
              </button>
              <p className="text-xs text-text-muted">La validation donne accès au téléchargement et supprime tes rushs de naocast pour libérer de l&apos;espace.</p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
