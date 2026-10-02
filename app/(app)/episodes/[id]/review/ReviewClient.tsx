"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { TranscriptCutEditor, type TranscriptSegment, type Speaker, type CutMarker } from "@/components/TranscriptCutEditor";
import { EPISODE_UPDATED_EVENT } from "@/components/SidebarNav";
import { pollJobUntilDone } from "@/lib/pollJob";

interface Job {
  id: string;
  type: string;
  status: string;
  errorMessage: string | null;
  progressPercent: number | null;
}

interface Rush {
  id: string;
  originalFilename: string | null;
  type: string;
}

const JOB_LABELS: Record<string, string> = {
  FETCH_RUSHES: "Récupération des rushs",
  TRANSCRIBE: "Transcription",
  SYNC_MULTICAM: "Synchro multicam",
  AUTOCUT: "Autocut",
  // Fusionné dans RENDER (cf. lib/pipeline/render.ts, renderVideo) : plus
  // jamais créé, gardé ici seulement pour libeller correctement un éventuel
  // vieux job resté en base d'avant ce changement.
  APPLY_MANUAL_CUTS: "Découpes",
  RENDER: "Rendu vidéo",
  EXPORT_AUDIO: "Export audio",
  MANUAL_TRANSCRIBE: "Transcript (avec locuteurs)",
};

const secondaryBtn = "text-sm font-semibold rounded-[10px] bg-white border border-border text-ink px-4 py-2 hover:bg-[#FAFAF8] transition";
// Boutons pilule pour les actions secondaires (auparavant du texte souligné,
// moins lisible comme cible cliquable et peu engageant visuellement).
const pillBtn = "text-xs font-semibold rounded-pill bg-white border border-border px-3 py-1.5 hover:bg-[#FAFAF8] transition disabled:opacity-50 disabled:cursor-not-allowed";
const fileInputClass =
  "w-full text-sm text-mint-muted file:mr-3 file:cursor-pointer file:rounded-[10px] file:border file:border-border file:bg-white file:px-4 file:py-2 file:text-sm file:font-semibold file:text-ink hover:file:bg-[#FAFAF8] disabled:opacity-50";

export function ReviewClient({
  episodeId,
  status: initialStatus,
  jobs: initialJobs,
  transcript,
  speakers,
  cutMarkers: initialCutMarkers,
  rushes,
  videoUrl,
  audioUrl,
  videoDownloadName,
  audioDownloadName,
  editorChoice,
  ownEditorEmail,
  initialExpectedSpeakerCount,
}: {
  episodeId: string;
  status: string;
  jobs: Job[];
  transcript: TranscriptSegment[];
  speakers: Speaker[];
  cutMarkers: CutMarker[];
  rushes: Rush[];
  videoUrl: string | null;
  audioUrl: string | null;
  videoDownloadName: string | null;
  audioDownloadName: string | null;
  editorChoice: string | null;
  ownEditorEmail: string | null;
  initialExpectedSpeakerCount: number | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [jobs, setJobs] = useState(initialJobs);
  const [cutMarkers, setCutMarkers] = useState(initialCutMarkers);
  const [showRecoupe, setShowRecoupe] = useState(false);
  const [validating, setValidating] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [regeneratingTranscript, setRegeneratingTranscript] = useState(false);
  const [transcriptRushId, setTranscriptRushId] = useState<string | null>(null);
  const [confirmingRestart, setConfirmingRestart] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [importingEdited, setImportingEdited] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [expectedSpeakerCount, setExpectedSpeakerCount] = useState<number | null>(initialExpectedSpeakerCount);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (status !== "QUEUED" && status !== "PROCESSING") return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/episodes/${episodeId}`);
        if (!res.ok) return; // erreur réseau/serveur transitoire : on retente au prochain tick
        const data = await res.json();
        if (!data?.status) return; // réponse inattendue : ne pas corrompre l'état local
        // La sidebar affiche un badge "Montage terminé" une fois l'épisode
        // EXPORTED (cf. SidebarNav), sans ce signal, elle garde l'état
        // fetché à son propre montage et ne saurait jamais qu'un export
        // s'est terminé en tâche de fond pendant qu'on reste sur cette page.
        if (data.status !== status) window.dispatchEvent(new Event(EPISODE_UPDATED_EVENT));
        setStatus(data.status);
        setJobs(data.jobs);
        // EXPORTED en plus de READY_FOR_REVIEW/FAILED : c'est l'état terminal
        // de l'export audio déclenché par /validate (cf. worker/run.ts), qui
        // vient de produire un nouvel ExportAsset audio, sans ce refresh,
        // audioUrl (calculé côté serveur) resterait celui d'avant la
        // validation (absent) jusqu'au prochain rechargement manuel.
        if (data.status === "READY_FOR_REVIEW" || data.status === "FAILED" || data.status === "EXPORTED") {
          router.refresh();
        }
      } catch {
        // idem : transitoire, on retente au prochain tick plutôt que de planter l'affichage.
      }
    }, 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [status, episodeId, router]);

  async function rerender() {
    await fetch(`/api/episodes/${episodeId}/rerender`, { method: "POST" });
    setStatus("QUEUED");
    router.refresh();
  }

  // Régénère le transcript (avec horodatages mot par mot + locuteurs) à
  // partir d'un rush déjà traité, utile pour un épisode dont le transcript
  // a été généré avant l'ajout de la sélection au mot près (transcript
  // "phrase entière" seulement, cf. words: null), ou pour relancer la
  // reconnaissance des locuteurs. Le rendu vidéo déjà produit n'est pas
  // affecté ; seuls le transcript et les locuteurs sont recalculés.
  async function regenerateTranscript(rushId: string) {
    setRegeneratingTranscript(true);
    try {
      const res = await fetch(`/api/episodes/${episodeId}/transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rushId, expectedSpeakerCount }),
      });
      if (!res.ok) throw new Error("Échec de la régénération du transcript.");
      const { jobId } = await res.json();
      const job = await pollJobUntilDone(episodeId, jobId);
      if (job.status === "FAILED") throw new Error(job.errorMessage || "Échec de la régénération du transcript.");
      router.refresh();
    } finally {
      setRegeneratingTranscript(false);
    }
  }

  async function validate() {
    // Passe par la file de jobs (cf. /validate) plutôt qu'un appel bloquant :
    // bascule sur la même vue "Traitement en cours" avec sa progression % par
    // % (job EXPORT_AUDIO) que le reste du pipeline, au lieu d'un simple état
    // de chargement sans retour pendant l'extraction audio.
    setValidating(true);
    await fetch(`/api/episodes/${episodeId}/validate`, { method: "POST" });
    setStatus("QUEUED");
    setValidating(false);
  }

  async function requestHumanEditor() {
    await fetch(`/api/episodes/${episodeId}/human-editor`, { method: "POST" });
    router.refresh();
  }

  async function retryProcessing() {
    setRetrying(true);
    await fetch(`/api/episodes/${episodeId}/retry`, { method: "POST" });
    setStatus("QUEUED");
    router.refresh();
  }

  // Repasse par le tunnel de montage depuis le début (étapes Cut/Rythme/
  // Générique/Logo...), contrairement à "Relancer le processus" qui ne fait
  // que réexécuter le même pipeline automatique. Efface rushs, transcript,
  // découpes, jobs et rendus (cf. /restart-tunnel) : il faut réimporter les rushs.
  async function restartTunnel() {
    setRestarting(true);
    try {
      await fetch(`/api/episodes/${episodeId}/restart-tunnel`, { method: "POST" });
      router.push(`/episodes/${episodeId}/montage`);
    } finally {
      setRestarting(false);
    }
  }

  // "Je lui envoie les rushs" (HAS_EDITOR_SEND) : une fois le montage terminé
  // par le monteur personnel, son fichier final revient par ce biais plutôt
  // que par un nouveau circuit dédié, même route que "J'importe l'épisode
  // déjà validé sur naocast." côté tunnel (cf. /import-edited), qui fait déjà
  // exactement ça (stocke le fichier comme export vidéo, passe l'épisode en
  // relecture).
  async function handleImportEdited(files: FileList | null) {
    if (!files || files.length === 0) return;
    setImportingEdited(true);
    setImportError(null);
    try {
      const form = new FormData();
      form.append("file", files[0]);
      const res = await fetch(`/api/episodes/${episodeId}/import-edited`, { method: "POST", body: form });
      if (!res.ok) throw new Error("Échec de l'import du fichier.");
      // QUEUED, pas READY_FOR_REVIEW : le fichier est déjà un montage validé
      // par le monteur, pas besoin de proposer des retouches, on enchaîne
      // directement sur l'export audio (cf. /import-edited) pour arriver aux
      // boutons finaux (vidéo + audio) sans étape intermédiaire.
      setStatus("QUEUED");
    } catch (e) {
      setImportError((e as Error).message);
    } finally {
      setImportingEdited(false);
    }
  }

  if (status === "HUMAN_EDITOR_REQUESTED") {
    // NEED_EDITOR : monteur naocast., payant (tarif ci-dessous). HAS_EDITOR_SEND :
    // monteur personnel de l'utilisateur, juste prévenu par email, aucun
    // tarif naocast., aucune prise de contact nécessaire de notre côté.
    if (editorChoice === "HAS_EDITOR_SEND") {
      return (
        <div className="space-y-4 max-w-2xl">
          <div className="rounded-xl bg-sky p-6 space-y-3">
            <h1 className="text-lg font-bold text-sky-ink">Envoyé à votre monteur</h1>
            <p className="text-sm text-sky-ink/70">
              Le récapitulatif de l&apos;épisode (rushs, découpes, génériques et réglages) a été envoyé par email
              {ownEditorEmail ? ` à ${ownEditorEmail}` : ""}.
            </p>
          </div>

          <div className="rounded-xl bg-mint p-5 space-y-3">
            <h2 className="font-medium text-mint-ink">Montage reçu ?</h2>
            <p className="text-sm text-mint-muted">
              Une fois le fichier final envoyé par votre monteur, importez-le ici pour passer à la relecture.
            </p>
            <input
              type="file"
              accept="video/*"
              disabled={importingEdited}
              onChange={(e) => handleImportEdited(e.target.files)}
              className={fileInputClass}
            />
            {importingEdited && <p className="text-sm text-mint-muted">Import en cours...</p>}
            {importError && <p className="text-sm text-[#8A2E1F]">{importError}</p>}
          </div>

          <div className="rounded-xl bg-peach p-5">
            <button onClick={() => setConfirmingRestart(true)} className={`${pillBtn} text-[#8A2E1F]`}>
              Recommencer le montage à zéro
            </button>
          </div>

          {confirmingRestart && (
            <RestartConfirmModal
              restarting={restarting}
              onCancel={() => setConfirmingRestart(false)}
              onConfirm={restartTunnel}
            />
          )}
        </div>
      );
    }
    return (
      <div className="space-y-4 max-w-2xl">
        <div className="rounded-xl bg-sky p-6 space-y-3">
          <h1 className="text-lg font-bold text-sky-ink">Envoyé à un monteur</h1>
          <p className="text-sm text-sky-ink/70">
            Cet épisode sera monté par un professionnel. Tarif : 380€ l&apos;épisode à l&apos;unité, ou 330€
            l&apos;épisode par pack de 5.
          </p>
          <a href="mailto:contact@nwes.fr?subject=Montage%20podcast" className="inline-block">
            <Button>Nous contacter pour la suite</Button>
          </a>
        </div>

        <div className="rounded-xl bg-peach p-5">
          <button onClick={() => setConfirmingRestart(true)} className={`${pillBtn} text-[#8A2E1F]`}>
            Recommencer le montage à zéro
          </button>
        </div>

        {confirmingRestart && (
          <RestartConfirmModal
            restarting={restarting}
            onCancel={() => setConfirmingRestart(false)}
            onConfirm={restartTunnel}
          />
        )}
      </div>
    );
  }

  if (status === "QUEUED" || status === "PROCESSING") {
    // Avance en continu (pas par palier) : un job DONE compte pour 100%, un
    // job RUNNING pour son progressPercent réel (0 s'il n'a pas encore
    // rapporté d'avancement, ex. étapes sans ffmpeg dominant), le reste 0%.
    const percent = jobs.length
      ? Math.round(
          jobs.reduce((sum, j) => {
            if (j.status === "DONE") return sum + 100;
            if (j.status === "RUNNING") return sum + (j.progressPercent ?? 0);
            return sum;
          }, 0) / jobs.length
        )
      : 0;
    return (
      <div className="rounded-xl bg-butter p-6 space-y-3 max-w-2xl">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-butter-ink">Traitement en cours...</h1>
          <span className="text-sm font-semibold text-butter-ink">{percent}%</span>
        </div>
        <div className="h-1.5 w-full rounded-pill bg-white overflow-hidden">
          <div
            className="h-full bg-primary-button rounded-pill transition-[width] duration-500"
            style={{ width: `${Math.max(percent, 4)}%` }}
          />
        </div>
        <ul className="text-sm divide-y divide-border rounded-md bg-white border border-border">
          {jobs.map((j) => (
            <li key={j.id} className="px-3 py-2 flex justify-between">
              <span>{JOB_LABELS[j.type] || j.type}</span>
              <span
                className={`text-xs font-medium ${
                  j.status === "DONE" ? "text-[#0F6B67]" : j.status === "RUNNING" ? "text-primary-button" : "text-text-muted"
                }`}
              >
                {j.status === "DONE" ? "Terminé" : j.status === "RUNNING" ? `En cours${j.progressPercent != null ? ` (${j.progressPercent}%)` : ""}` : "En attente"}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (status === "FAILED") {
    const failed = jobs.find((j) => j.status === "FAILED");
    return (
      <div className="rounded-xl bg-butter p-6 space-y-3 max-w-2xl">
        <h1 className="text-lg font-bold text-[#8A2E1F]">Le traitement a échoué</h1>
        {failed && <p className="text-sm text-butter-ink">{JOB_LABELS[failed.type]}: {failed.errorMessage}</p>}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button onClick={retryProcessing} disabled={retrying} className="!text-sm !px-4 !py-2">
            {retrying ? "Relance en cours..." : "Relancer le processus"}
          </Button>
          <a
            href={`mailto:contact@nwes.fr?subject=Échec%20de%20traitement&body=Épisode%20${episodeId}%20:%20${encodeURIComponent(
              failed ? `${JOB_LABELS[failed.type]} : ${failed.errorMessage}` : ""
            )}`}
            className={secondaryBtn}
          >
            Contacter le support
          </a>
          <button onClick={requestHumanEditor} className={secondaryBtn}>
            Faire appel à un monteur à la place
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 rounded-xl bg-mint p-5">
          <h1 className="text-lg font-bold text-mint-ink mb-3">
            {status === "EXPORTED" ? "Épisode exporté" : "Relecture"}
          </h1>
          {videoUrl && <video src={videoUrl} controls className="w-full rounded-md bg-black" />}
        </div>

        <div className="lg:col-span-1 space-y-4">
          {status === "READY_FOR_REVIEW" && (
            <div className="rounded-xl bg-sky p-5 space-y-3">
              <button onClick={() => setShowRecoupe((s) => !s)} className={`${pillBtn} text-sky-ink`}>
                {showRecoupe ? "Masquer le transcript" : "Recouper un passage"}
              </button>
              <div className="pt-3 border-t border-border space-y-3">
                <Button onClick={validate} disabled={validating} className="w-full">
                  {validating ? "Export en cours..." : "Valider et exporter"}
                </Button>
              </div>
            </div>
          )}

          {status === "EXPORTED" && (
            <div className="rounded-xl bg-sky p-5 flex flex-col gap-3">
              {videoUrl && (
                <a href={videoUrl} download={videoDownloadName || true} className={`${secondaryBtn} text-center`}>
                  Télécharger la vidéo
                </a>
              )}
              {audioUrl && (
                <a href={audioUrl} download={audioDownloadName || true} className={`${secondaryBtn} text-center`}>
                  Télécharger l&apos;audio
                </a>
              )}
            </div>
          )}

          <div className="rounded-xl bg-peach p-5">
            <button
              onClick={() => setConfirmingRestart(true)}
              className={`${pillBtn} text-[#8A2E1F]`}
            >
              Recommencer le montage à zéro
            </button>
          </div>
        </div>
      </div>

      {confirmingRestart && (
        <RestartConfirmModal
          restarting={restarting}
          onCancel={() => setConfirmingRestart(false)}
          onConfirm={restartTunnel}
        />
      )}

      {status === "READY_FOR_REVIEW" && showRecoupe && (
        <div className="rounded-xl bg-butter p-5 space-y-3">
          <div>
            <label className="block text-xs mb-1 text-butter-ink/70">
              Nombre de locuteurs (optionnel, mais recommandé pour régénérer)
            </label>
            <input
              type="number"
              min={1}
              step={1}
              value={expectedSpeakerCount ?? ""}
              onChange={(e) => setExpectedSpeakerCount(e.target.value ? Number(e.target.value) : null)}
              placeholder="Ex. 4"
              className="rounded-md border border-border bg-white px-3 py-1.5 w-24 text-sm"
            />
          </div>
          {rushes.length === 1 && (
            <button
              onClick={() => regenerateTranscript(rushes[0].id)}
              disabled={regeneratingTranscript}
              className={`${pillBtn} text-butter-ink`}
            >
              {regeneratingTranscript ? "Régénération en cours..." : "Régénérer le transcript"}
            </button>
          )}
          {rushes.length > 1 && (
            <div className="space-y-1 text-xs text-butter-ink/70">
              <p>Régénérer le transcript à partir de :</p>
              <div className="flex flex-wrap items-center gap-3">
                {rushes.map((r) => (
                  <label key={r.id} className="flex items-center gap-1">
                    <input
                      type="radio"
                      name="regenTranscriptRush"
                      checked={transcriptRushId === r.id}
                      onChange={() => setTranscriptRushId(r.id)}
                    />
                    {r.originalFilename || r.type}
                  </label>
                ))}
                <button
                  onClick={() => transcriptRushId && regenerateTranscript(transcriptRushId)}
                  disabled={!transcriptRushId || regeneratingTranscript}
                  className={`${pillBtn} text-butter-ink`}
                >
                  {regeneratingTranscript ? "Régénération en cours..." : "Régénérer"}
                </button>
              </div>
            </div>
          )}
          <TranscriptCutEditor
            episodeId={episodeId}
            transcript={transcript}
            speakers={speakers}
            cutMarkers={cutMarkers}
            onCutMarkersChange={setCutMarkers}
          />
          {cutMarkers.length > 0 && (
            <Button onClick={rerender} className="block !text-sm !px-4 !py-2">
              Relancer le rendu avec {cutMarkers.length} découpe(s)
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// Partagé entre tous les états d'où l'on peut vouloir repartir à zéro
// (relecture, envoyé à un monteur...) pour éviter de tripler ce balisage.
function RestartConfirmModal({
  restarting,
  onCancel,
  onConfirm,
}: {
  restarting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-4" onClick={() => !restarting && onCancel()}>
      <div className="bg-white rounded-xl p-5 max-w-sm w-full space-y-3" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-semibold text-ink">Recommencer le montage à zéro ?</h2>
        <p className="text-sm text-text-muted">
          Les rushs importés, le transcript, les découpes et le rendu actuels seront définitivement supprimés, et le
          tunnel de montage rouvrira depuis le début : vous devrez réimporter vos rushs.
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={restarting}
            className="text-sm rounded-[10px] bg-white border border-border text-ink px-3 py-1.5 hover:bg-[#FAFAF8] transition disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={restarting}
            className="text-sm font-semibold rounded-[10px] bg-[#8A2E1F] text-white px-3 py-1.5 hover:brightness-110 transition disabled:opacity-50"
          >
            {restarting ? "Réinitialisation..." : "Recommencer à zéro"}
          </button>
        </div>
      </div>
    </div>
  );
}
