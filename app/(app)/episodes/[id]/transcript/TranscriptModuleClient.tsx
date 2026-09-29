"use client";

import { useState } from "react";
import { useSimulatedProgress } from "@/lib/useSimulatedProgress";

interface Rush {
  id: string;
  originalFilename: string | null;
  type: string;
}

interface TranscriptSentence {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  speaker: string | null;
}

interface Speaker {
  id: string;
  label: string;
  displayName: string | null;
}

const pillBtn =
  "text-xs font-semibold rounded-pill bg-white border border-border px-3 py-1.5 hover:bg-[#FAFAF8] transition disabled:opacity-50 disabled:cursor-not-allowed";

function formatTime(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Module "Transcript" : soit affiche le transcript déjà généré (étape "Cut"
// du tunnel de montage ou ce module lui-même), soit permet de le générer
// directement ici, même endpoint /transcript que le tunnel.
export function TranscriptModuleClient({
  episodeId,
  rushes,
  initialTranscript,
  initialSpeakers,
  initialExpectedSpeakerCount,
  episodeLabel,
}: {
  episodeId: string;
  rushes: Rush[];
  initialTranscript: TranscriptSentence[];
  initialSpeakers: Speaker[];
  initialExpectedSpeakerCount: number | null;
  episodeLabel: string;
}) {
  const [transcript, setTranscript] = useState<TranscriptSentence[]>(initialTranscript);
  const [speakers, setSpeakers] = useState<Speaker[]>(initialSpeakers);
  const [expectedSpeakerCount, setExpectedSpeakerCount] = useState<number | null>(initialExpectedSpeakerCount);
  const [rushId, setRushId] = useState<string | null>(rushes[0]?.id ?? null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const transcribeProgress = useSimulatedProgress(generating);

  async function renameSpeaker(speakerId: string, displayName: string) {
    setSpeakers((sp) => sp.map((s) => (s.id === speakerId ? { ...s, displayName } : s)));
    await fetch(`/api/episodes/${episodeId}/speakers/${speakerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: displayName.trim() || null }),
    });
  }

  function speakerDisplay(label: string | null): string | null {
    if (!label) return null;
    const idx = speakers.findIndex((sp) => sp.label === label);
    if (idx === -1) return label;
    return speakers[idx].displayName || `Locuteur ${idx + 1}`;
  }

  // Même format pour la copie et le téléchargement : une ligne par phrase,
  // horodatage + locuteur (si connu) + texte, comme affiché à l'écran.
  function buildFullText(): string {
    return transcript
      .map((s) => {
        const speakerName = speakerDisplay(s.speaker);
        return `${formatTime(s.startMs)}${speakerName ? ` ${speakerName} :` : ""} ${s.text}`;
      })
      .join("\n");
  }

  async function copyTranscript() {
    try {
      await navigator.clipboard.writeText(buildFullText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Échec de la copie dans le presse-papier.");
    }
  }

  function downloadTranscript() {
    const blob = new Blob([buildFullText()], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    // Caractères interdits dans un nom de fichier (Windows/macOS) retirés du
    // titre (libre, donc potentiellement porteur de "/" ou ":") pour éviter un
    // téléchargement au nom tronqué ou invalide.
    a.download = `Transcript - ${episodeLabel.replace(/[\\/:*?"<>|]/g, " ")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function generateTranscript() {
    if (!rushId) return;
    setGenerating(true);
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
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-ink">Transcript</h1>
          <p className="text-sm text-text-muted">
            Le transcript complet de l&apos;épisode, avec reconnaissance des locuteurs.
          </p>
        </div>
        {transcript.length > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={copyTranscript}
              title="Copier le transcript"
              className="rounded-md border border-border bg-white p-2 text-ink hover:bg-[#FAFAF8] transition"
            >
              {copied ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M5 13l4 4L19 7" stroke="#0F6B67" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <rect x="9" y="9" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="2" />
                  <path d="M5 15V6a1.5 1.5 0 0 1 1.5-1.5H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              )}
            </button>
            <button
              type="button"
              onClick={downloadTranscript}
              title="Télécharger en .txt"
              className="rounded-md border border-border bg-white p-2 text-ink hover:bg-[#FAFAF8] transition"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M12 4v11m0 0l-4-4m4 4l4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5 18v1.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-[#8A2E1F]">{error}</p>}

      {transcript.length === 0 ? (
        <div className="rounded-xl bg-mint p-5 space-y-3">
          {rushes.length === 0 ? (
            <p className="text-sm text-mint-ink">
              Sélectionnez au moins un rush à l&apos;étape « Analyse » du tunnel de montage pour générer le transcript.
            </p>
          ) : (
            <>
              <p className="text-sm text-mint-ink">Aucun transcript pour le moment.</p>
              {rushes.length > 1 && (
                <div className="space-y-1">
                  <p className="text-sm text-mint-ink">Sur quel rush baser le transcript ?</p>
                  {rushes.map((r) => (
                    <label key={r.id} className="flex items-center gap-2 text-sm text-mint-ink">
                      <input type="radio" name="transcriptRush" checked={rushId === r.id} onChange={() => setRushId(r.id)} />
                      {r.originalFilename || r.type}
                    </label>
                  ))}
                </div>
              )}
              <div>
                <label className="block text-sm mb-1 text-mint-ink">Nombre de locuteurs (optionnel, mais recommandé)</label>
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
              <button
                type="button"
                onClick={generateTranscript}
                disabled={!rushId || generating}
                className="text-sm font-semibold rounded-[10px] bg-primary-button text-white px-4 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {generating ? `Génération en cours... ${transcribeProgress}%` : "Générer le transcript"}
              </button>
            </>
          )}
        </div>
      ) : (
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

          <div className="rounded-xl bg-mint p-4">
            <div className="max-h-[36rem] overflow-y-auto space-y-2 text-sm leading-relaxed">
              {transcript.map((sentence) => {
                const speakerName = speakerDisplay(sentence.speaker);
                return (
                  <p key={sentence.id}>
                    <span className="text-xs text-text-muted mr-2">{formatTime(sentence.startMs)}</span>
                    {speakerName && <span className="mr-2 font-semibold text-[#0F6B67]">{speakerName} :</span>}
                    {sentence.text}
                  </p>
                );
              })}
            </div>
          </div>

          {rushes.length > 0 && (
            <button type="button" onClick={generateTranscript} disabled={generating} className={pillBtn}>
              {generating ? `Régénération en cours... ${transcribeProgress}%` : "Régénérer le transcript"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
