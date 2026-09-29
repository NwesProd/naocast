"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/Button";
import { TranscriptCutEditor, type TranscriptSegment, type Speaker, type CutMarker } from "@/components/TranscriptCutEditor";
import { EPISODE_UPDATED_EVENT } from "@/components/SidebarNav";

const secondaryBtn = "text-sm rounded-[10px] bg-white border border-border text-ink px-3 py-1.5 hover:bg-[#FAFAF8] transition";
const listCardClass = "divide-y rounded-md bg-white border border-border";
const fileInputClass =
  "w-full text-sm text-mint-muted file:mr-3 file:cursor-pointer file:rounded-[10px] file:border file:border-border file:bg-white file:px-4 file:py-2 file:text-sm file:font-semibold file:text-ink hover:file:bg-[#FAFAF8] disabled:opacity-50";
// Boutons pilule pour les actions secondaires (auparavant du texte souligné,
// moins lisible comme cible cliquable et peu engageant visuellement).
const pillBtn = "text-xs font-semibold rounded-pill bg-white border border-border px-3 py-1.5 hover:bg-[#FAFAF8] transition disabled:opacity-50 disabled:cursor-not-allowed";

function ComingSoonBadge() {
  return (
    <span className="inline-block rounded-pill bg-peach text-peach-muted text-[10px] font-semibold px-2 py-0.5 uppercase tracking-wide shrink-0">
      Bientôt disponible
    </span>
  );
}

interface Rush {
  id: string;
  type: string;
  status: string;
  originalFilename: string | null;
  durationSec: number | null;
  selectedForEpisode: boolean;
}

const STEPS = [
  "Monteur",
  "Import",
  "Analyse",
  "Tournage",
  "Rythme",
  "Cut",
  "Intro",
  "Générique de début",
  "Générique de fin",
  "Logo",
  "Lancer",
] as const;

type LogoPosition = "TOP_LEFT" | "TOP_RIGHT" | "BOTTOM_LEFT" | "BOTTOM_RIGHT";
type EditorChoice = "PODKO" | "NEED_EDITOR" | "HAS_EDITOR_SEND" | "HAS_EDITOR_IMPORT";
type IntroOutroSource = "PODCAST" | "EPISODE";
type GenericCreationMode = "IMPORT" | "CUSTOM";
type GenericCustomMode = "TEASER_COMPILATION" | "OWN_IDEA";
type IntroTeaserChoice = "NONE" | "MODULE" | "IMPORT";

const LOGO_POSITION_LABELS: Record<LogoPosition, string> = {
  TOP_LEFT: "En haut à gauche",
  TOP_RIGHT: "En haut à droite",
  BOTTOM_LEFT: "En bas à gauche",
  BOTTOM_RIGHT: "En bas à droite",
};

function formatTime(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// fetch() n'expose pas la progression d'envoi d'un FormData, XMLHttpRequest,
// via son événement upload.onprogress, est la seule API navigateur qui le
// permette. `onProgress` reçoit le nombre d'octets déjà envoyés POUR CE
// FICHIER (l'appelant l'agrège avec les fichiers précédents s'il y en a
// plusieurs).
function uploadWithProgress(url: string, form: FormData, onProgress: (bytesSent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Échec de l'upload (code ${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("Échec de l'upload (erreur réseau)."));
    xhr.send(form);
  });
}

// Un générique (début ou fin) est complet dès que la source choisie mène à
// quelque chose d'exploitable : podcast (déjà réglé ailleurs), fichier
// importé, teaser compilé automatiquement, ou indications textuelles saisies.
function isGenericComplete(
  source: IntroOutroSource,
  hasHumanEditor: boolean,
  hasFile: boolean,
  creationMode: GenericCreationMode | null,
  customMode: GenericCustomMode | null,
  customDescription: string
): boolean {
  if (source === "PODCAST") return true;
  if (!hasHumanEditor) return hasFile;
  if (creationMode === "IMPORT") return hasFile;
  if (creationMode === "CUSTOM") {
    if (customMode === "TEASER_COMPILATION") return true;
    if (customMode === "OWN_IDEA") return customDescription.trim().length > 0;
    return false;
  }
  return false;
}

// Tunnel de montage (étapes "Import" → "Lancer"), ouvert depuis l'onglet
// "Montage" de la sidebar une fois l'épisode créé (titre/saison/n°/date,
// cf. app/(app)/episodes/[id]/new).
export function EpisodeWizard({
  episodeId,
  initialRushes,
  initialCutMarkers,
  podcastLogo,
  initialLogoSettings,
  initialEditorChoice,
  initialCameraSetup,
  initialExpectedSpeakerCount,
  initialIntroTeaser,
  initialGenerics,
}: {
  episodeId: string;
  initialRushes: Rush[];
  initialCutMarkers: CutMarker[];
  podcastLogo: { hasLogo: boolean; hasIntro: boolean; hasOutro: boolean };
  initialLogoSettings: { logoEnabled: boolean; logoOnIntro: boolean; logoOnOutro: boolean; logoPosition: LogoPosition };
  initialEditorChoice: EditorChoice | null;
  initialCameraSetup: "PRE_EDITED" | "MULTI_CAMERA" | null;
  initialExpectedSpeakerCount: number | null;
  initialIntroTeaser: { validated: boolean; choice: IntroTeaserChoice; hasImport: boolean };
  initialGenerics: {
    introSource: IntroOutroSource;
    hasEpisodeIntro: boolean;
    introCreationMode: GenericCreationMode | null;
    introCustomMode: GenericCustomMode | null;
    introCustomDescription: string;
    outroSource: IntroOutroSource;
    hasEpisodeOutro: boolean;
    outroCreationMode: GenericCreationMode | null;
    outroCustomMode: GenericCustomMode | null;
    outroCustomDescription: string;
  };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState(0);
  const [rushes, setRushes] = useState<Rush[]>(initialRushes);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadPhase, setUploadPhase] = useState<"sending" | "processing">("sending");
  const [cameraSetup, setCameraSetup] = useState<"PRE_EDITED" | "MULTI_CAMERA" | null>(initialCameraSetup);
  const [autocutEnabled, setAutocutEnabled] = useState(false);
  const [autocutSilenceMs, setAutocutSilenceMs] = useState(3000);
  const [transcript, setTranscript] = useState<TranscriptSegment[] | null>(null);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [transcriptRushId, setTranscriptRushId] = useState<string | null>(null);
  const [generatingTranscript, setGeneratingTranscript] = useState(false);
  const [expectedSpeakerCount, setExpectedSpeakerCount] = useState<number | null>(initialExpectedSpeakerCount);
  const [previewModal, setPreviewModal] = useState<{ filename: string; url: string | null } | null>(null);
  const [cutMarkers, setCutMarkers] = useState<CutMarker[]>(initialCutMarkers);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logoEnabled, setLogoEnabled] = useState(initialLogoSettings.logoEnabled);
  const [logoOnIntro, setLogoOnIntro] = useState(initialLogoSettings.logoOnIntro);
  const [logoOnOutro, setLogoOnOutro] = useState(initialLogoSettings.logoOnOutro);
  const [logoPosition, setLogoPosition] = useState<LogoPosition>(initialLogoSettings.logoPosition);
  const [introTeaserValidated] = useState(initialIntroTeaser.validated);
  const [introTeaserChoice, setIntroTeaserChoice] = useState<IntroTeaserChoice>(initialIntroTeaser.choice);
  const [hasIntroTeaserImport, setHasIntroTeaserImport] = useState(initialIntroTeaser.hasImport);
  const [introTeaserImportUploading, setIntroTeaserImportUploading] = useState(false);
  const [editorChoice, setEditorChoice] = useState<EditorChoice | null>(initialEditorChoice);
  const [showHasEditorSubChoice, setShowHasEditorSubChoice] = useState(false);
  const [editorActionLoading, setEditorActionLoading] = useState(false);
  const [introSource, setIntroSource] = useState<IntroOutroSource>(initialGenerics.introSource);
  const [hasEpisodeIntro, setHasEpisodeIntro] = useState(initialGenerics.hasEpisodeIntro);
  const [introUploading, setIntroUploading] = useState(false);
  const [introCreationMode, setIntroCreationMode] = useState<GenericCreationMode | null>(initialGenerics.introCreationMode);
  const [introCustomMode, setIntroCustomMode] = useState<GenericCustomMode | null>(initialGenerics.introCustomMode);
  const [introCustomDescription, setIntroCustomDescription] = useState(initialGenerics.introCustomDescription);
  const [outroSource, setOutroSource] = useState<IntroOutroSource>(initialGenerics.outroSource);
  const [hasEpisodeOutro, setHasEpisodeOutro] = useState(initialGenerics.hasEpisodeOutro);
  const [outroUploading, setOutroUploading] = useState(false);
  const [outroCreationMode, setOutroCreationMode] = useState<GenericCreationMode | null>(initialGenerics.outroCreationMode);
  const [outroCustomMode, setOutroCustomMode] = useState<GenericCustomMode | null>(initialGenerics.outroCustomMode);
  const [outroCustomDescription, setOutroCustomDescription] = useState(initialGenerics.outroCustomDescription);
  const [ownEditorEmail, setOwnEditorEmail] = useState("");

  // Certains appelants (ex. le bouton "Charger le transcript") n'attendent
  // pas cette fonction dans leur propre try/catch, une erreur réseau ou un
  // accroc serveur ponctuel (redémarrage du serveur de dev, requête coupée en
  // plein milieu...) ne doit donc jamais remonter comme exception non gérée
  // (ça faisait planter tout le composant avec "Unexpected end of JSON
  // input" au lieu d'un message d'erreur lisible).
  async function refreshEpisode() {
    try {
      const res = await fetch(`/api/episodes/${episodeId}`);
      if (!res.ok) throw new Error("Échec du rechargement de l'épisode.");
      const data = await res.json();
      setRushes(data.rushes);
      setTranscript(data.transcriptSegments);
      setSpeakers(data.speakers);
      setCutMarkers(data.cutMarkers);
    } catch {
      setError("Échec du rechargement de l'épisode, réessayez.");
    }
  }

  // Renomme un locuteur détecté par la diarization ("SPEAKER_00" → nom réel),
  // possible dès que le transcript est chargé, aucune contrainte d'étape.
  async function renameSpeaker(speakerId: string, displayName: string) {
    setSpeakers((sp) => sp.map((s) => (s.id === speakerId ? { ...s, displayName } : s)));
    await fetch(`/api/episodes/${episodeId}/speakers/${speakerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: displayName.trim() || null }),
    });
  }

  // Génère (ou régénère) le transcript de l'épisode à partir d'un seul rush
  // choisi par l'utilisateur (cf. étape "Cut") : pas de fusion multi-fichiers,
  // pour éviter des locuteurs incohérents d'un fichier à l'autre en cas de
  // rushs séparés (caméras non synchronisées).
  async function generateTranscript(rushId: string) {
    setGeneratingTranscript(true);
    setError(null);
    try {
      const res = await fetch(`/api/episodes/${episodeId}/transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rushId, expectedSpeakerCount }),
      });
      if (!res.ok) throw new Error("Échec de la génération du transcript.");
      const data = await res.json();
      setTranscript(data.transcriptSegments);
      setSpeakers(data.speakers);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGeneratingTranscript(false);
    }
  }

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadProgress(0);
    setUploadPhase("sending");
    setError(null);
    try {
      const fileArray = Array.from(files);
      const totalBytes = fileArray.reduce((sum, f) => sum + f.size, 0);
      let bytesSentBeforeCurrent = 0;
      for (const file of fileArray) {
        const form = new FormData();
        form.append("file", file);
        try {
          await uploadWithProgress(`/api/episodes/${episodeId}/rushes`, form, (sentInFile) => {
            const pct = totalBytes > 0 ? Math.round(((bytesSentBeforeCurrent + sentInFile) / totalBytes) * 100) : 0;
            setUploadProgress(pct);
            // Tout envoyé mais la requête n'a pas encore répondu : le serveur
            // stocke le fichier et en extrait la durée, pas de % mesurable
            // pour cette partie, on change juste le message plutôt que de
            // figer une fausse valeur.
            if (pct >= 100) setUploadPhase("processing");
          });
        } catch {
          throw new Error("Échec de l'upload de " + file.name);
        }
        bytesSentBeforeCurrent += file.size;
      }
      await refreshEpisode();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function handleExternalLink(type: "SMASH" | "GOOGLE_DRIVE" | "DROPBOX", ref: string) {
    if (!ref.trim()) return;
    await fetch(`/api/episodes/${episodeId}/rushes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, externalRef: ref }),
    });
    await refreshEpisode();
  }

  async function deleteRush(rushId: string) {
    setRushes((rs) => rs.filter((r) => r.id !== rushId));
    await fetch(`/api/episodes/${episodeId}/rushes/${rushId}`, { method: "DELETE" });
  }

  async function toggleRushSelected(rushId: string, selected: boolean) {
    setRushes((rs) => rs.map((r) => (r.id === rushId ? { ...r, selectedForEpisode: selected } : r)));
    await fetch(`/api/episodes/${episodeId}/rushes/${rushId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selectedForEpisode: selected }),
    });
  }

  async function saveCameraSetup(value: "PRE_EDITED" | "MULTI_CAMERA") {
    setCameraSetup(value);
    await fetch(`/api/episodes/${episodeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cameraSetup: value }),
    });
  }

  async function saveAutocut() {
    await fetch(`/api/episodes/${episodeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ autocutEnabled, autocutSilenceMs }),
    });
  }

  async function saveLogoSettings(
    patch: Partial<{ logoEnabled: boolean; logoOnIntro: boolean; logoOnOutro: boolean; logoPosition: LogoPosition }>
  ) {
    if ("logoEnabled" in patch) setLogoEnabled(patch.logoEnabled!);
    if ("logoOnIntro" in patch) setLogoOnIntro(patch.logoOnIntro!);
    if ("logoOnOutro" in patch) setLogoOnOutro(patch.logoOnOutro!);
    if ("logoPosition" in patch) setLogoPosition(patch.logoPosition!);
    await fetch(`/api/episodes/${episodeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  // Étape "Intro" : choisir explicitement d'utiliser le teaser validé dans le
  // module (MODULE) plutôt qu'un fichier importé directement (IMPORT), ou
  // aucun des deux (NONE, valeur par défaut). "MODULE" n'a d'effet dans le
  // rendu final que si le teaser a bien été validé dans le module (cf.
  // introTeaserValidated) : construire un brouillon ne l'active pas seul.
  async function saveIntroTeaserChoice(value: IntroTeaserChoice) {
    setIntroTeaserChoice(value);
    await fetch(`/api/episodes/${episodeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ introTeaserChoice: value }),
    });
    window.dispatchEvent(new Event(EPISODE_UPDATED_EVENT));
  }

  async function handleIntroTeaserImportUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setIntroTeaserImportUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", files[0]);
      const res = await fetch(`/api/episodes/${episodeId}/intro-teaser-import`, { method: "POST", body: form });
      if (!res.ok) throw new Error("Échec de l'import de l'intro.");
      setHasIntroTeaserImport(true);
      setIntroTeaserChoice("IMPORT");
      window.dispatchEvent(new Event(EPISODE_UPDATED_EVENT));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIntroTeaserImportUploading(false);
    }
  }

  // Étape "1. Monteur", "Utiliser naocast." / "J'ai besoin d'un monteur" /
  // "J'ai déjà un monteur → je lui envoie les rushs" : les trois continuent
  // le même tunnel (cf. STEPS), ne divergent qu'à l'étape "Lancer" (soit géré
  // côté serveur pour PODKO/NEED_EDITOR, cf. enqueueEpisodePipeline, soit via
  // /send-to-own-editor pour HAS_EDITOR_SEND).
  async function selectMainEditorChoice(value: "PODKO" | "NEED_EDITOR" | "HAS_EDITOR_SEND") {
    setEditorChoice(value);
    await fetch(`/api/episodes/${episodeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ editorChoice: value }),
    });
    goToStep(1);
  }

  // "J'ai déjà un monteur" → "J'importe l'épisode déjà validé sur naocast." :
  // épisode déjà monté ailleurs, on importe directement le rendu final.
  async function handleImportEdited(files: FileList | null) {
    if (!files || files.length === 0) return;
    setEditorActionLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", files[0]);
      const res = await fetch(`/api/episodes/${episodeId}/import-edited`, { method: "POST", body: form });
      if (!res.ok) throw new Error("Échec de l'import du fichier.");
      router.push(`/episodes/${episodeId}/review`);
    } catch (e) {
      setError((e as Error).message);
      setEditorActionLoading(false);
    }
  }

  // Aperçu AVANT traitement : ouvre une popup avec le rush directement
  // lisible, plutôt que la version brute (window.open sur le fichier
  // original) qui déclenchait un téléchargement pour la plupart des
  // conteneurs caméra (HEVC/ProRes en .mov, souvent illisibles inline par le
  // navigateur). Le serveur transcode à la demande (cf.
  // .../rushes/[rushId]/preview), mis en cache après la première génération.
  async function openRushPreview(rushId: string, filename: string) {
    setPreviewModal({ filename, url: null });
    const res = await fetch(`/api/episodes/${episodeId}/rushes/${rushId}/preview`);
    if (!res.ok) {
      setError("Aperçu indisponible pour ce rush.");
      setPreviewModal(null);
      return;
    }
    const data = await res.json();
    setPreviewModal({ filename, url: data.url });
  }

  async function saveIntroSource(value: IntroOutroSource) {
    setIntroSource(value);
    await fetch(`/api/episodes/${episodeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ introSource: value }),
    });
  }

  async function handleIntroUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setIntroUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", files[0]);
      const res = await fetch(`/api/episodes/${episodeId}/intro`, { method: "POST", body: form });
      if (!res.ok) throw new Error("Échec de l'upload du générique de début.");
      setHasEpisodeIntro(true);
      setIntroSource("EPISODE");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIntroUploading(false);
    }
  }

  // Générique sur-mesure (monteur humain impliqué) : "Importer un fichier"
  // garde le comportement existant (upload direct) ; "Créer le générique
  // sur-mesure" laisse des indications textuelles pour le monteur à la place
  // d'un fichier.
  async function saveIntroCreationMode(value: GenericCreationMode) {
    setIntroCreationMode(value);
    await fetch(`/api/episodes/${episodeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ introCreationMode: value }),
    });
  }

  async function saveIntroCustomMode(value: GenericCustomMode) {
    setIntroCustomMode(value);
    await fetch(`/api/episodes/${episodeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ introCustomMode: value }),
    });
  }

  async function saveIntroCustomDescription() {
    await fetch(`/api/episodes/${episodeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ introCustomDescription }),
    });
  }

  async function saveOutroSource(value: IntroOutroSource) {
    setOutroSource(value);
    await fetch(`/api/episodes/${episodeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outroSource: value }),
    });
  }

  async function handleOutroUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setOutroUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", files[0]);
      const res = await fetch(`/api/episodes/${episodeId}/outro`, { method: "POST", body: form });
      if (!res.ok) throw new Error("Échec de l'upload du générique de fin.");
      setHasEpisodeOutro(true);
      setOutroSource("EPISODE");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOutroUploading(false);
    }
  }

  async function saveOutroCreationMode(value: GenericCreationMode) {
    setOutroCreationMode(value);
    await fetch(`/api/episodes/${episodeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outroCreationMode: value }),
    });
  }

  async function saveOutroCustomMode(value: GenericCustomMode) {
    setOutroCustomMode(value);
    await fetch(`/api/episodes/${episodeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outroCustomMode: value }),
    });
  }

  async function saveOutroCustomDescription() {
    await fetch(`/api/episodes/${episodeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outroCustomDescription }),
    });
  }

  async function removeCutMarker(markerId: string) {
    setCutMarkers((m) => m.filter((x) => x.id !== markerId));
    await fetch(`/api/episodes/${episodeId}/cut-markers/${markerId}`, { method: "DELETE" });
  }

  async function handleFinalSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await saveAutocut();
      const res = await fetch(`/api/episodes/${episodeId}/submit`, { method: "POST" });
      if (!res.ok) throw new Error("Impossible de lancer le traitement.");
      router.push(`/episodes/${episodeId}/review`);
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  // "J'ai déjà un monteur" → étape "Lancer" : au lieu de traiter l'épisode,
  // envoie un récapitulatif (rushs, découpes, génériques...) par email au
  // monteur personnel de l'utilisateur.
  async function handleSendToOwnEditor() {
    if (!ownEditorEmail.trim()) {
      setError("Renseignez l'adresse email de votre monteur.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await saveAutocut();
      const res = await fetch(`/api/episodes/${episodeId}/send-to-own-editor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: ownEditorEmail.trim() }),
      });
      if (!res.ok) throw new Error("Impossible d'envoyer l'email.");
      router.push(`/episodes/${episodeId}/review`);
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  // Le logo peut s'afficher sur le générique de début/fin (étape "Logo")
  // quel qu'en soit la source (config podcast ou spécifique à l'épisode).
  const effectiveHasIntro = introSource === "EPISODE" ? hasEpisodeIntro : podcastLogo.hasIntro;
  const effectiveHasOutro = outroSource === "EPISODE" ? hasEpisodeOutro : podcastLogo.hasOutro;
  // Un monteur humain (naocast. ou personnel) peut créer un générique sur-mesure
  // à partir d'indications, plutôt que de recevoir un fichier déjà prêt,
  // n'a de sens que si un humain est effectivement impliqué (cf. étapes
  // "Générique de début/fin").
  const hasHumanEditor = editorChoice === "NEED_EDITOR" || editorChoice === "HAS_EDITOR_SEND";
  // Rushs éligibles pour servir de base au transcript (étape "Cut"), s'il y
  // en a plusieurs, l'utilisateur doit choisir lequel utiliser (cf.
  // generateTranscript).
  const selectableRushesForTranscript = rushes.filter((r) => r.selectedForEpisode && r.status === "READY");

  // Complétude recalculée à chaque rendu (pas de ratchet type `maxStep`) :
  // si on revient en arrière et qu'une étape suivante devient invalide, elle
  // redevient incomplète et inaccessible.
  function isStepComplete(i: number): boolean {
    switch (i) {
      case 0:
        return editorChoice === "PODKO" || editorChoice === "NEED_EDITOR" || editorChoice === "HAS_EDITOR_SEND";
      case 1:
        return rushes.length > 0;
      case 2:
        return rushes.some((r) => r.selectedForEpisode);
      case 3:
        return cameraSetup !== null;
      // case 6 ("Intro") volontairement absent : étape optionnelle, tombe
      // sur le `default: return true` ci-dessous, comme "Rythme" et "Logo".
      case 7:
        return isGenericComplete(introSource, hasHumanEditor, hasEpisodeIntro, introCreationMode, introCustomMode, introCustomDescription);
      case 8:
        return isGenericComplete(outroSource, hasHumanEditor, hasEpisodeOutro, outroCreationMode, outroCustomMode, outroCustomDescription);
      default:
        return true;
    }
  }

  function canReach(i: number): boolean {
    for (let j = 0; j < i; j++) {
      if (!isStepComplete(j)) return false;
    }
    return true;
  }

  const WIZARD_STEP_STORAGE_KEY = `podko:wizardStep:${episodeId}`;

  // Change d'étape ET mémorise aussitôt le choix en localStorage, dans le
  // même appel plutôt que via un effet séparé déclenché par le changement de
  // `step` : un effet séparé écrit la valeur COURANTE au moment de son
  // exécution, qui au tout premier rendu (avant que l'effet de restauration
  // ci-dessous n'ait fait effet) vaut encore l'état initial (0), il
  // écrasait alors l'étape mémorisée qu'on venait de lire, juste avant même
  // qu'elle ne s'affiche (constaté en conditions réelles : le retour au
  // tunnel repartait toujours de l'étape 1). Passer par une seule fonction
  // élimine cette course : la valeur écrite est toujours exactement celle
  // qu'on vient de définir.
  function goToStep(n: number) {
    setStep(n);
    try {
      localStorage.setItem(WIZARD_STEP_STORAGE_KEY, String(n));
    } catch {
      // best-effort : navigation privée ou storage indisponible.
    }
  }

  // Reprend le tunnel là où l'utilisateur l'avait laissé plutôt que de
  // toujours repartir de l'étape 1 : soit une étape précise demandée
  // explicitement via l'URL (ex. le lien "Retourner au montage de l'épisode"
  // du module Intro, ?step=6), soit la dernière étape mémorisée en
  // localStorage si le tunnel avait déjà été entamé auparavant. Repli sur la
  // plus avancée réellement accessible si les prérequis d'une étape mémorisée
  // ne sont plus remplis entre-temps (ex. rush supprimé depuis).
  useEffect(() => {
    const fromUrl = searchParams.get("step");
    let target = fromUrl !== null ? Number(fromUrl) : NaN;
    if (Number.isNaN(target)) {
      try {
        const stored = localStorage.getItem(WIZARD_STEP_STORAGE_KEY);
        target = stored !== null ? Number(stored) : NaN;
      } catch {
        target = NaN;
      }
    }
    if (Number.isNaN(target) || target === 0) return;
    let clamped = Math.max(0, Math.min(target, STEPS.length - 1));
    while (clamped > 0 && !canReach(clamped)) clamped -= 1;
    if (clamped > 0) {
      goToStep(clamped);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const STEP_HINTS: Partial<Record<number, string>> = {
    0: "Choisissez qui monte cet épisode pour continuer.",
    1: "Ajoutez au moins un fichier pour continuer.",
    2: "Sélectionnez au moins un rush pour continuer.",
    3: "Choisissez un type de tournage pour continuer.",
    7: "Complétez le générique de début pour continuer.",
    8: "Complétez le générique de fin pour continuer.",
  };

  const currentStepComplete = isStepComplete(step);

  return (
    <div>
      <ol className="flex flex-wrap gap-2 text-xs mb-6">
        {STEPS.map((label, i) => {
          const isCurrent = i === step;
          const reachable = canReach(i);
          // Uniquement les étapes déjà dépassées (i < step) : sinon une étape
          // optionnelle jamais visitée (toujours "complète" par défaut, ex.
          // Rythme/Cut/Logo) passerait en vert dès que les étapes qui la
          // précèdent le sont, avant même d'avoir été ouverte.
          const isValidated = i < step && reachable && isStepComplete(i);
          return (
            <li
              key={label}
              onClick={() => reachable && !isCurrent && goToStep(i)}
              className={`px-3 py-1.5 rounded-pill font-medium transition ${
                isCurrent
                  ? "bg-primary-button text-white"
                  : isValidated
                    ? "bg-accent-teal text-white cursor-pointer hover:brightness-110"
                    : reachable
                      ? "bg-peach text-peach-muted cursor-pointer hover:brightness-95"
                      : "bg-peach text-peach-muted opacity-60"
              }`}
            >
              {i + 1}. {label}
            </li>
          );
        })}
      </ol>

      {error && <p className="text-sm text-[#8A2E1F] mb-4">{error}</p>}

      <div className="rounded-xl bg-mint p-6 min-h-[280px]">
        {step === 0 && (
          <div className="space-y-4">
            {!showHasEditorSubChoice ? (
              <>
                <h2 className="font-medium text-mint-ink">Qui monte cet épisode ?</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <EditorCard
                    label="Utiliser naocast."
                    description="Autocut, découpes, générique et logo incrustés automatiquement."
                    selected={editorChoice === "PODKO"}
                    onClick={() => selectMainEditorChoice("PODKO")}
                  />
                  <EditorCard
                    label="J'ai besoin d'un monteur"
                    description="Vous importez vos rushs ici, un monteur naocast. s'occupe du reste."
                    selected={editorChoice === "NEED_EDITOR"}
                    onClick={() => selectMainEditorChoice("NEED_EDITOR")}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowHasEditorSubChoice(true)}
                  className={`${pillBtn} text-mint-muted`}
                >
                  J&apos;ai déjà un monteur
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setShowHasEditorSubChoice(false)}
                  className={`${pillBtn} text-mint-muted`}
                >
                  ← Retour
                </button>
                <h2 className="font-medium text-mint-ink">Vous avez déjà un monteur</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <EditorCard
                    label="Je lui envoie les rushs et lui donne des indications"
                    description="Même tunnel que naocast. (rushs, découpes, génériques...) ; à la fin, un récapitulatif est envoyé par email à votre monteur."
                    selected={editorChoice === "HAS_EDITOR_SEND"}
                    onClick={() => selectMainEditorChoice("HAS_EDITOR_SEND")}
                  />
                  <div className="rounded-[10px] p-4 border border-border bg-white text-ink">
                    <p className="font-semibold text-sm">J&apos;importe l&apos;épisode déjà validé sur naocast.</p>
                    <p className="text-xs mt-1 mb-2 text-text-muted">
                      Le montage est déjà terminé ailleurs : import direct du rendu final.
                    </p>
                    <input
                      type="file"
                      accept="video/*"
                      disabled={editorActionLoading}
                      onChange={(e) => handleImportEdited(e.target.files)}
                      className={fileInputClass}
                    />
                  </div>
                </div>
                {editorActionLoading && <p className="text-sm text-mint-muted">Envoi en cours...</p>}
              </>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <h2 className="font-medium text-mint-ink">Import des rushs</h2>
            <div>
              <label className="block text-sm mb-1 text-mint-ink">Upload direct</label>
              <input
                type="file"
                multiple
                accept="video/*,audio/*"
                disabled={uploading}
                onChange={(e) => handleUpload(e.target.files)}
                className={fileInputClass}
              />
              {uploading && (
                <div className="mt-2 space-y-1">
                  <p className="text-sm font-semibold text-[#0F6B67]">
                    {uploadPhase === "sending" ? `Envoi en cours... ${uploadProgress}%` : "Finalisation..."}
                  </p>
                  <div className="h-1.5 w-full max-w-xs rounded-pill bg-white overflow-hidden">
                    <div
                      className="h-full bg-[#0F6B67] rounded-pill transition-[width] duration-300"
                      style={{ width: uploadPhase === "sending" ? `${uploadProgress}%` : "100%" }}
                    />
                  </div>
                </div>
              )}
            </div>

            <ExternalLinkField label="Lien Smash" type="SMASH" onSubmit={handleExternalLink} disabled />

            {rushes.length > 0 && (
              <ul className={`${listCardClass} text-sm mt-3`}>
                {rushes.map((r) => (
                  <li key={r.id} className="px-3 py-2 flex items-center justify-between gap-3">
                    <span>{r.originalFilename || `(${r.type}) référence externe`}</span>
                    <span className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-text-muted">{r.status}</span>
                      <button
                        type="button"
                        onClick={() => deleteRush(r.id)}
                        className="text-xs text-[#8A2E1F] hover:brightness-110"
                        title="Supprimer ce rush"
                      >
                        ✕
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <h2 className="font-medium text-mint-ink">Analyse du transfert</h2>
            <p className="text-sm text-mint-muted">
              Sélectionnez les fichiers à traiter pour cet épisode.
            </p>
            <ul className={listCardClass}>
              {rushes.map((r) => (
                <li key={r.id} className="px-3 py-2 flex items-center justify-between text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={r.selectedForEpisode}
                      onChange={(e) => toggleRushSelected(r.id, e.target.checked)}
                    />
                    {r.originalFilename || r.type}
                    {r.durationSec ? ` · ${formatTime(r.durationSec * 1000)}` : ""}
                  </label>
                  <div className="flex items-center gap-3">
                    {r.status === "READY" && (
                      <button
                        type="button"
                        onClick={() => openRushPreview(r.id, r.originalFilename || r.type)}
                        className={`${pillBtn} text-primary-button`}
                      >
                        Aperçu
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="font-medium text-mint-ink">Pré-montage ou caméras séparées ?</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <EditorCard
                label="Pré-montage (ou caméra unique)"
                description="Le pré-montage est déjà fait, ou une seule caméra a filmé l'épisode."
                selected={cameraSetup === "PRE_EDITED"}
                onClick={() => saveCameraSetup("PRE_EDITED")}
              />
              <EditorCard
                label="Caméras séparées, non synchronisées"
                description={
                  hasHumanEditor
                    ? "Votre monteur se chargera de la synchro et du switch entre les caméras."
                    : "Synchro et switch multicam automatiques : pas encore disponibles."
                }
                selected={cameraSetup === "MULTI_CAMERA"}
                onClick={() => saveCameraSetup("MULTI_CAMERA")}
                disabled={!hasHumanEditor}
              />
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h2 className="font-medium text-mint-ink">Rythme</h2>
            <label className="flex items-center gap-2 text-sm text-mint-ink">
              <input
                type="checkbox"
                checked={autocutEnabled}
                onChange={(e) => setAutocutEnabled(e.target.checked)}
              />
              Couper les silences
            </label>
            {autocutEnabled && (
              <div>
                <label className="block text-sm mb-1 text-mint-ink">
                  Durée de silence à partir de laquelle couper (ms)
                </label>
                <input
                  type="number"
                  min={100}
                  step={50}
                  value={autocutSilenceMs}
                  onChange={(e) => setAutocutSilenceMs(Number(e.target.value))}
                  className="rounded-md border border-border bg-white px-3 py-2 w-32"
                />
              </div>
            )}
          </div>
        )}

        {step === 5 && (
          <div className="space-y-3">
            <h2 className="font-medium text-mint-ink">Cut</h2>
            <p className="text-sm text-mint-muted">
              Cette étape sert à retirer des passages de l&apos;épisode : sélectionnez dans le transcript les mots ou
              phrases à couper.
            </p>
            {!transcript && (
              <button
                onClick={refreshEpisode}
                className={`${pillBtn} text-mint-muted`}
              >
                Charger le transcript
              </button>
            )}
            {transcript && transcript.length === 0 && selectableRushesForTranscript.length === 0 && (
              <p className="text-sm text-mint-muted">
                Sélectionnez au moins un rush à l&apos;étape « Analyse » pour générer le transcript.
              </p>
            )}
            {transcript && transcript.length === 0 && selectableRushesForTranscript.length > 0 && (
              <div>
                <label className="block text-sm mb-1 text-mint-ink">
                  Nombre de locuteurs (optionnel, mais recommandé)
                </label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={expectedSpeakerCount ?? ""}
                  onChange={(e) => setExpectedSpeakerCount(e.target.value ? Number(e.target.value) : null)}
                  placeholder="Ex. 4"
                  className="rounded-md border border-border bg-white px-3 py-2 w-24 text-sm"
                />
              </div>
            )}
            {transcript && transcript.length === 0 && selectableRushesForTranscript.length === 1 && (
              <button
                onClick={() => generateTranscript(selectableRushesForTranscript[0].id)}
                disabled={generatingTranscript}
                className={`${pillBtn} text-mint-muted`}
              >
                {generatingTranscript ? "Génération en cours..." : "Générer le transcript"}
              </button>
            )}
            {transcript && transcript.length === 0 && selectableRushesForTranscript.length > 1 && (
              <div className="space-y-2">
                <p className="text-sm text-mint-ink">
                  Plusieurs rushs sélectionnés : sur lequel baser le transcript ? La reconnaissance des
                  locuteurs n&apos;est fiable que sur un seul fichier à la fois.
                </p>
                <div className="space-y-1">
                  {selectableRushesForTranscript.map((r) => (
                    <label key={r.id} className="flex items-center gap-2 text-sm text-mint-ink">
                      <input
                        type="radio"
                        name="transcriptRush"
                        checked={transcriptRushId === r.id}
                        onChange={() => setTranscriptRushId(r.id)}
                      />
                      {r.originalFilename || r.type}
                    </label>
                  ))}
                </div>
                <button
                  onClick={() => transcriptRushId && generateTranscript(transcriptRushId)}
                  disabled={!transcriptRushId || generatingTranscript}
                  className="text-sm font-semibold rounded-[10px] bg-primary-button text-white px-4 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {generatingTranscript ? "Génération en cours..." : "Générer le transcript"}
                </button>
              </div>
            )}
            {transcript && transcript.length > 0 && (
              <div className="space-y-3">
                {speakers.length > 0 && (
                  <div className="rounded-md bg-white border border-border p-3 space-y-2">
                    <p className="text-xs font-medium text-ink">
                      Locuteurs détectés : donnez-leur un nom pour qu&apos;il apparaisse dans le transcript
                    </p>
                    {speakers.map((sp, i) => (
                      <div key={sp.id} className="flex items-center gap-2">
                        <span className="text-xs text-text-muted w-20 shrink-0">Locuteur {i + 1}</span>
                        <input
                          type="text"
                          defaultValue={sp.displayName || ""}
                          placeholder="Ex. Animateur, Invité..."
                          onBlur={(e) => renameSpeaker(sp.id, e.target.value)}
                          className="flex-1 rounded-md border border-border px-2 py-1 text-sm"
                        />
                      </div>
                    ))}
                  </div>
                )}
                <TranscriptCutEditor
                  episodeId={episodeId}
                  transcript={transcript}
                  speakers={speakers}
                  cutMarkers={cutMarkers}
                  onCutMarkersChange={setCutMarkers}
                />
              </div>
            )}

            {cutMarkers.length > 0 && (
              <ul className={`${listCardClass} text-sm`}>
                {cutMarkers.map((m) => (
                  <li key={m.id} className="px-3 py-2 flex justify-between items-center">
                    <span>
                      {formatTime(m.startMs)} → {formatTime(m.endMs)}{" "}
                      <span className="text-xs text-text-muted">({m.source === "AUTOCUT" ? "autocut" : "manuel"})</span>
                    </span>
                    <button onClick={() => removeCutMarker(m.id)} className="text-xs text-[#8A2E1F]">
                      Retirer
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {step === 6 && (
          <div className="space-y-4">
            <h2 className="font-medium text-mint-ink">Intro</h2>
            <p className="text-sm text-mint-muted">
              Tu peux ici construire et insérer ton intro, avant le générique de début : un teaser de quelques
              passages choisis.
            </p>

            <div className="space-y-2">
              {introTeaserValidated ? (
                <Link
                  href={`/episodes/${episodeId}/intro`}
                  className="inline-block text-sm font-semibold rounded-[10px] bg-primary-button text-white px-4 py-2 hover:brightness-110 transition"
                >
                  Retourner au module Intro
                </Link>
              ) : !transcript || transcript.length === 0 ? (
                <p className="text-sm text-mint-ink">
                  Générez d&apos;abord le transcript à l&apos;étape « Cut » pour pouvoir choisir des passages.
                </p>
              ) : (
                <Link
                  href={`/episodes/${episodeId}/intro`}
                  className="inline-block text-sm font-semibold rounded-[10px] bg-primary-button text-white px-4 py-2 hover:brightness-110 transition"
                >
                  Ouvrir le module Intro
                </Link>
              )}

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={!introTeaserValidated}
                  onClick={() => saveIntroTeaserChoice("MODULE")}
                  // Couleur volontairement DIFFÉRENTE du bouton "Ouvrir/Retourner au
                  // module Intro" (primary-button orange) : ce bouton-ci reflète un
                  // ÉTAT (l'intro validée est bien celle utilisée) plutôt qu'une
                  // action de navigation, les deux se confondaient en un seul et
                  // même orange, donnant l'impression de deux actions équivalentes.
                  className={`text-sm font-semibold rounded-[10px] px-4 py-2 border transition disabled:opacity-40 disabled:cursor-not-allowed ${
                    introTeaserChoice === "MODULE" && introTeaserValidated
                      ? "bg-accent-teal text-white border-accent-teal"
                      : "bg-white border-border text-ink hover:bg-[#FAFAF8]"
                  }`}
                >
                  {introTeaserChoice === "MODULE" && introTeaserValidated ? "✓ Intro validée utilisée" : "Utiliser l'intro validée"}
                </button>
                {!introTeaserValidated && (
                  <span className="text-xs text-mint-muted">Aucune intro validée pour l&apos;instant dans le module.</span>
                )}
              </div>

              <div className="rounded-[10px] p-3 border border-border bg-white">
                <p className="text-sm font-medium text-ink mb-1">Importer une intro</p>
                <input
                  type="file"
                  accept="video/*,audio/*"
                  disabled={introTeaserImportUploading}
                  onChange={(e) => handleIntroTeaserImportUpload(e.target.files)}
                  className={fileInputClass}
                />
                {introTeaserImportUploading && <p className="text-sm text-mint-muted mt-1">Envoi en cours...</p>}
                {hasIntroTeaserImport && introTeaserChoice === "IMPORT" && (
                  <p className="text-sm font-semibold text-[#0F6B67] mt-1">Intro importée, utilisée pour cet épisode.</p>
                )}
              </div>
            </div>

            <p className="text-xs text-mint-muted">
              Optionnel : sans intro choisie, l&apos;épisode démarre directement sur le générique de début.
            </p>
          </div>
        )}

        {step === 7 && (
          <GenericStepBody
            title="Générique de début"
            source={introSource}
            onSourceChange={saveIntroSource}
            hasPodcastLevel={podcastLogo.hasIntro}
            hasEpisodeFile={hasEpisodeIntro}
            uploading={introUploading}
            onUpload={handleIntroUpload}
            hasHumanEditor={hasHumanEditor}
            creationMode={introCreationMode}
            onCreationModeChange={saveIntroCreationMode}
            customMode={introCustomMode}
            onCustomModeChange={saveIntroCustomMode}
            customDescription={introCustomDescription}
            onCustomDescriptionChange={setIntroCustomDescription}
            onCustomDescriptionBlur={saveIntroCustomDescription}
          />
        )}

        {step === 8 && (
          <GenericStepBody
            title="Générique de fin"
            source={outroSource}
            onSourceChange={saveOutroSource}
            hasPodcastLevel={podcastLogo.hasOutro}
            hasEpisodeFile={hasEpisodeOutro}
            uploading={outroUploading}
            onUpload={handleOutroUpload}
            hasHumanEditor={hasHumanEditor}
            creationMode={outroCreationMode}
            onCreationModeChange={saveOutroCreationMode}
            customMode={outroCustomMode}
            onCustomModeChange={saveOutroCustomMode}
            customDescription={outroCustomDescription}
            onCustomDescriptionChange={setOutroCustomDescription}
            onCustomDescriptionBlur={saveOutroCustomDescription}
          />
        )}

        {step === 9 && (
          <div className="space-y-4">
            <h2 className="font-medium text-mint-ink">Logo</h2>
            {!podcastLogo.hasLogo ? (
              <p className="text-sm text-mint-muted">
                Aucun logo configuré pour ce podcast. Ajoutez-en un depuis « Mon podcast » pour qu&apos;il
                s&apos;incruste automatiquement sur vos épisodes.
              </p>
            ) : (
              <>
                <label className="flex items-center gap-2 text-sm text-mint-ink">
                  <input
                    type="checkbox"
                    checked={!logoEnabled}
                    onChange={(e) => saveLogoSettings({ logoEnabled: !e.target.checked })}
                  />
                  Je ne veux pas de logo sur l&apos;épisode
                </label>

                {logoEnabled && (
                  <>
                    <p className="text-sm text-mint-muted">
                      Le logo est incrusté sur le corps de l&apos;épisode. Vous pouvez aussi l&apos;afficher (ou non)
                      sur le générique de début et de fin.
                    </p>
                    {effectiveHasIntro && (
                      <label className="flex items-center gap-2 text-sm text-mint-ink">
                        <input
                          type="checkbox"
                          checked={logoOnIntro}
                          onChange={(e) => saveLogoSettings({ logoOnIntro: e.target.checked })}
                        />
                        Afficher le logo sur le générique de début
                      </label>
                    )}
                    {effectiveHasOutro && (
                      <label className="flex items-center gap-2 text-sm text-mint-ink">
                        <input
                          type="checkbox"
                          checked={logoOnOutro}
                          onChange={(e) => saveLogoSettings({ logoOnOutro: e.target.checked })}
                        />
                        Afficher le logo sur le générique de fin
                      </label>
                    )}

                    <div>
                      <p className="text-sm mb-2 text-mint-ink">Position</p>
                      <div className="grid grid-cols-2 gap-2 max-w-xs">
                        {(Object.keys(LOGO_POSITION_LABELS) as LogoPosition[]).map((pos) => (
                          <button
                            key={pos}
                            type="button"
                            onClick={() => saveLogoSettings({ logoPosition: pos })}
                            className={`rounded-[10px] px-3 py-2 text-sm text-left transition ${
                              logoPosition === pos ? "bg-primary-button text-white" : "bg-white border border-border text-ink hover:bg-[#FAFAF8]"
                            }`}
                          >
                            {LOGO_POSITION_LABELS[pos]}
                          </button>
                        ))}
                      </div>
                    </div>

                    <p className="text-xs text-mint-muted">
                      La taille d&apos;affichage du logo est standardisée automatiquement, quelle que soit la
                      résolution du fichier importé dans « Mon podcast ».
                    </p>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {step === 10 && (
          <div className="space-y-4">
            <h2 className="font-medium text-mint-ink">Lancer le traitement</h2>
            {editorChoice === "NEED_EDITOR" && (
              <p className="text-sm text-mint-muted">
                L&apos;épisode sera envoyé à un monteur naocast. avec les rushs, découpes et réglages choisis
                dans ce tunnel.
              </p>
            )}
            {editorChoice === "HAS_EDITOR_SEND" && (
              <p className="text-sm text-mint-muted">
                Un récapitulatif (rushs, découpes, génériques et réglages choisis) sera envoyé par email à votre
                monteur.
              </p>
            )}
            {editorChoice !== "NEED_EDITOR" && editorChoice !== "HAS_EDITOR_SEND" && (
              <p className="text-sm text-mint-muted">
                Le pipeline automatique récupère les rushs, applique l&apos;autocut si activé, retire les
                passages sélectionnés, incruste générique et logo, puis produit le rendu vidéo.
              </p>
            )}

            {editorChoice === "HAS_EDITOR_SEND" ? (
              <div className="space-y-2 max-w-xs">
                <label className="block text-sm mb-1 text-mint-ink">Email de votre monteur</label>
                <input
                  type="email"
                  value={ownEditorEmail}
                  onChange={(e) => setOwnEditorEmail(e.target.value)}
                  placeholder="monteur@exemple.com"
                  className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm"
                />
                <Button onClick={handleSendToOwnEditor} disabled={submitting}>
                  {submitting ? "Envoi..." : "Envoyer à mon monteur"}
                </Button>
              </div>
            ) : (
              <Button onClick={handleFinalSubmit} disabled={submitting}>
                {submitting
                  ? "Lancement..."
                  : editorChoice === "NEED_EDITOR"
                    ? "Envoyer au monteur"
                    : "Lancer le traitement automatique"}
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          onClick={() => goToStep(Math.max(0, step - 1))}
          disabled={step === 0}
          className="text-sm text-text-muted disabled:opacity-30"
        >
          ← Précédent
        </button>
        {step > 0 && step < STEPS.length - 1 && (
          <div className="flex items-center gap-3">
            {!currentStepComplete && STEP_HINTS[step] && (
              <p className="text-xs text-[#8A2E1F]">{STEP_HINTS[step]}</p>
            )}
            <button
              onClick={() => goToStep(Math.min(STEPS.length - 1, step + 1))}
              disabled={(step === 1 && uploading) || !currentStepComplete}
              className={`${secondaryBtn} disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              Suivant →
            </button>
          </div>
        )}
      </div>

      {previewModal && (
        <div
          className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-4"
          onClick={() => setPreviewModal(null)}
        >
          <div className="bg-white rounded-xl p-4 max-w-2xl w-full space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-ink truncate" title={previewModal.filename}>
                {previewModal.filename}
              </p>
              <button
                type="button"
                onClick={() => setPreviewModal(null)}
                className="text-sm text-text-muted hover:text-ink shrink-0"
              >
                Fermer ✕
              </button>
            </div>
            {previewModal.url ? (
              <>
                <video src={previewModal.url} controls autoPlay className="w-full max-h-[70vh] rounded-md bg-black" />
                <p className="text-xs text-text-muted">Aperçu limité aux 90 premières secondes.</p>
              </>
            ) : (
              <p className="text-sm text-text-muted py-8 text-center">Génération de l&apos;aperçu en cours...</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Étapes "Générique de début/fin" : partagé entre les deux (structure
// identique) pour éviter la duplication. Le choix "Créer le générique
// sur-mesure" (import → indications textuelles) n'a de sens que si un
// monteur humain est impliqué (cf. hasHumanEditor), sans humain pour
// l'interpréter, seul l'import d'un fichier reste possible.
function GenericStepBody({
  title,
  source,
  onSourceChange,
  hasPodcastLevel,
  hasEpisodeFile,
  uploading,
  onUpload,
  hasHumanEditor,
  creationMode,
  onCreationModeChange,
  customMode,
  onCustomModeChange,
  customDescription,
  onCustomDescriptionChange,
  onCustomDescriptionBlur,
}: {
  title: string;
  source: IntroOutroSource;
  onSourceChange: (v: IntroOutroSource) => void;
  hasPodcastLevel: boolean;
  hasEpisodeFile: boolean;
  uploading: boolean;
  onUpload: (files: FileList | null) => void;
  hasHumanEditor: boolean;
  creationMode: GenericCreationMode | null;
  onCreationModeChange: (v: GenericCreationMode) => void;
  customMode: GenericCustomMode | null;
  onCustomModeChange: (v: GenericCustomMode) => void;
  customDescription: string;
  onCustomDescriptionChange: (v: string) => void;
  onCustomDescriptionBlur: () => void;
}) {
  const nameKey = title.replace(/\s+/g, "-");
  return (
    <div className="space-y-4">
      <h2 className="font-medium text-mint-ink">{title}</h2>
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm text-mint-ink">
          <input type="radio" name={`${nameKey}-source`} checked={source === "PODCAST"} onChange={() => onSourceChange("PODCAST")} />
          Générique importé dans naocast.
          {!hasPodcastLevel && " (aucun configuré dans « Mon podcast »)"}
        </label>
        <label className="flex items-center gap-2 text-sm text-mint-ink">
          <input type="radio" name={`${nameKey}-source`} checked={source === "EPISODE"} onChange={() => onSourceChange("EPISODE")} />
          Générique spécifique à cet épisode
        </label>
      </div>

      {source === "EPISODE" && !hasHumanEditor && (
        <div>
          <input type="file" accept="video/*,audio/*" disabled={uploading} onChange={(e) => onUpload(e.target.files)} className={fileInputClass} />
          {uploading && <p className="text-sm text-mint-muted mt-1">Envoi en cours...</p>}
          {hasEpisodeFile && !uploading && <p className="text-sm font-semibold text-[#0F6B67] mt-1">Générique importé.</p>}
        </div>
      )}

      {source === "EPISODE" && hasHumanEditor && (
        <div className="space-y-3">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-mint-ink">
              <input type="radio" name={`${nameKey}-creation`} checked={creationMode === "IMPORT"} onChange={() => onCreationModeChange("IMPORT")} />
              Importer un fichier
            </label>
            <label className="flex items-center gap-2 text-sm text-mint-ink">
              <input type="radio" name={`${nameKey}-creation`} checked={creationMode === "CUSTOM"} onChange={() => onCreationModeChange("CUSTOM")} />
              Créer le générique sur-mesure
            </label>
          </div>

          {creationMode === "IMPORT" && (
            <div>
              <input type="file" accept="video/*,audio/*" disabled={uploading} onChange={(e) => onUpload(e.target.files)} className={fileInputClass} />
              {uploading && <p className="text-sm text-mint-muted mt-1">Envoi en cours...</p>}
              {hasEpisodeFile && !uploading && <p className="text-sm font-semibold text-[#0F6B67] mt-1">Générique importé.</p>}
            </div>
          )}

          {creationMode === "CUSTOM" && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-mint-ink">
                <input
                  type="radio"
                  name={`${nameKey}-custom`}
                  checked={customMode === "TEASER_COMPILATION"}
                  onChange={() => onCustomModeChange("TEASER_COMPILATION")}
                />
                Compiler les meilleurs extraits en teaser
              </label>
              <label className="flex items-center gap-2 text-sm text-mint-ink">
                <input type="radio" name={`${nameKey}-custom`} checked={customMode === "OWN_IDEA"} onChange={() => onCustomModeChange("OWN_IDEA")} />
                J&apos;ai mon idée
              </label>
              {customMode === "OWN_IDEA" && (
                <textarea
                  rows={6}
                  value={customDescription}
                  onChange={(e) => onCustomDescriptionChange(e.target.value)}
                  onBlur={onCustomDescriptionBlur}
                  placeholder="Décrivez votre idée pour ce générique : ambiance, message, éléments à inclure..."
                  className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm"
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EditorCard({
  label,
  description,
  selected,
  onClick,
  disabled,
}: {
  label: string;
  description: string;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <div className="text-left rounded-[10px] p-4 border border-border bg-[#FAFAF8] cursor-not-allowed">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold text-sm text-text-muted">{label}</p>
          <ComingSoonBadge />
        </div>
        <p className="text-xs mt-1 text-text-muted">{description}</p>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-[10px] p-4 border transition ${
        selected
          ? "bg-primary-button text-white border-primary-button"
          : "bg-white border-border text-ink hover:bg-[#FAFAF8]"
      }`}
    >
      <p className="font-semibold text-sm">{label}</p>
      <p className={`text-xs mt-1 ${selected ? "text-white/80" : "text-text-muted"}`}>{description}</p>
    </button>
  );
}

function ExternalLinkField({
  label,
  type,
  onSubmit,
  disabled,
}: {
  label: string;
  type: "SMASH" | "GOOGLE_DRIVE" | "DROPBOX";
  onSubmit: (type: "SMASH" | "GOOGLE_DRIVE" | "DROPBOX", ref: string) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("");

  // Grisé tant que le rapatriement automatique n'est pas branché : afficher
  // un champ à l'air pleinement fonctionnel qui ne fait rien au clic est plus
  // trompeur qu'un badge "Bientôt disponible" clair.
  if (disabled) {
    return (
      <div className="rounded-[10px] p-4 border border-border bg-[#FAFAF8]">
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-sm font-medium text-text-muted">{label}</p>
          <ComingSoonBadge />
        </div>
        <div className="flex gap-2">
          <input
            disabled
            placeholder="Coller le lien..."
            className="flex-1 rounded-md border border-border bg-white/60 px-3 py-1.5 text-sm text-text-muted cursor-not-allowed"
          />
          <button disabled className={`${secondaryBtn} opacity-50 cursor-not-allowed`}>
            Ajouter
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <label className="block text-sm mb-1 text-mint-ink">{label}</label>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Coller le lien..."
          className="flex-1 rounded-md border border-border bg-white px-3 py-1.5 text-sm"
        />
        <button
          onClick={() => {
            onSubmit(type, value);
            setValue("");
          }}
          className={secondaryBtn}
        >
          Ajouter
        </button>
      </div>
    </div>
  );
}
