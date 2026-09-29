import { readFile, mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { randomUUID } from "crypto";
import { extractAudio } from "@/lib/pipeline/ffmpeg";

// Reconnaissance des locuteurs (qui parle quand), hébergé par pyannote.ai,
// même logique que la transcription (cf. transcribe.ts) : aucun calcul local,
// juste un appel API. Contrairement à Whisper/Groq qui accepte un upload
// direct, pyannote.ai ne travaille que sur une URL : il faut d'abord uploader
// le fichier vers leur stockage temporaire (auto-supprimé sous 48h) avant de
// pouvoir lancer le job, qui est lui-même asynchrone (poll jusqu'à complétion,
// résultat supprimé côté pyannote 24h après la fin du job, à persister
// immédiatement, cf. appelant).
const API_BASE = "https://api.pyannote.ai/v1";
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 120; // ~10 min, largement au-dessus de la durée d'un épisode

export interface DiarizationSegment {
  speaker: string;
  startMs: number;
  endMs: number;
}

export async function diarizeAudio(sourceFilePath: string, numSpeakers?: number | null): Promise<DiarizationSegment[]> {
  const apiKey = process.env.PYANNOTEAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "PYANNOTEAI_API_KEY manquant : configurez une clé API pour activer la reconnaissance des locuteurs (voir .env)."
    );
  }
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
  const workDir = await mkdtemp(path.join(tmpdir(), "podtool-diarize-"));

  try {
    const audioPath = path.join(workDir, "audio.mp3");
    await extractAudio(sourceFilePath, audioPath);

    const objectKey = `podtool-${randomUUID()}`;
    const inputRes = await fetch(`${API_BASE}/media/input`, {
      method: "POST",
      headers,
      body: JSON.stringify({ url: `media://${objectKey}` }),
    });
    if (!inputRes.ok) {
      throw new Error(`pyannote.ai : échec de la préparation de l'upload (${inputRes.status})`);
    }
    const { url: uploadUrl } = (await inputRes.json()) as { url: string };

    const fileBuffer = await readFile(audioPath);
    const putRes = await fetch(uploadUrl, { method: "PUT", body: fileBuffer });
    if (!putRes.ok) {
      throw new Error(`pyannote.ai : échec de l'upload du fichier (${putRes.status})`);
    }

    const jobRes = await fetch(`${API_BASE}/diarize`, {
      method: "POST",
      headers,
      // "precision-3" : modèle le plus précis actuellement chez pyannote.ai
      // (contrôles fins en plus, vadSensitivity, crosstalkSensitivity, non
      // disponibles sur les autres modèles). "community-1" (gratuit) se
      // trompait nettement en conditions réelles, à la fois sur le compte de
      // locuteurs et sur la répartition. Nécessite un abonnement actif
      // (Developer 19€/mois minimum), cf. échange avec l'utilisateur.
      //
      // numSpeakers, quand connu : laisser le modèle deviner le nombre de
      // locuteurs se trompe régulièrement en conditions réelles (ex. 2
      // détectés au lieu de 4), lui donner le compte exact "sort la
      // détection de la boucle" et améliore nettement la précision (cf. doc
      // pyannote.ai). Incompatible avec minSpeakers/maxSpeakers, non utilisés
      // ici.
      body: JSON.stringify({
        url: `media://${objectKey}`,
        model: "precision-3",
        ...(numSpeakers ? { numSpeakers } : {}),
      }),
    });
    if (!jobRes.ok) {
      throw new Error(`pyannote.ai : échec de la création du job de diarization (${jobRes.status})`);
    }
    const { jobId } = (await jobRes.json()) as { jobId: string };

    const output = await pollJob(jobId, headers);
    const segments = (output?.diarization ?? []) as { speaker: string; start: number; end: number }[];
    return segments.map((s) => ({
      speaker: s.speaker,
      startMs: Math.round(s.start * 1000),
      endMs: Math.round(s.end * 1000),
    }));
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function pollJob(
  jobId: string,
  headers: Record<string, string>
): Promise<{ diarization?: unknown[] } | null> {
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    const res = await fetch(`${API_BASE}/jobs/${jobId}`, { headers });
    const data = (await res.json()) as { status: string; output?: { diarization?: unknown[] } };
    if (data.status === "succeeded") return data.output ?? null;
    if (data.status === "failed" || data.status === "canceled") {
      throw new Error(`pyannote.ai : le job de diarization a échoué (${data.status})`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error("pyannote.ai : délai d'attente dépassé pour le job de diarization");
}

function overlapMs(aStartMs: number, aEndMs: number, bStartMs: number, bEndMs: number): number {
  return Math.min(aEndMs, bEndMs) - Math.max(aStartMs, bStartMs);
}

// Associe à chaque segment de transcript (Whisper) le locuteur pyannote le
// plus probable, par vote majoritaire MOT PAR MOT plutôt qu'un simple
// recouvrement sur toute la phrase : les deux découpages n'ont pas les mêmes
// frontières, et une phrase de plusieurs secondes chevauche souvent DEUX
// segments de diarization (léger décalage de frontière, tour de parole qui
// change en cours de phrase...). Comparer le recouvrement de la phrase
// entière ne retenait alors qu'UN seul segment "gagnant" au global, parfois
// celui qui ne couvre en réalité qu'une petite portion non représentative de
// la phrase, constaté en conditions réelles comme cause de locuteurs
// associés à la mauvaise phrase, y compris à locuteurs corrects par ailleurs
// (indépendant du nombre de locuteurs détecté, cf. expectedSpeakerCount).
// Voter mot par mot (chaque mot pondéré par sa durée) et prendre le locuteur
// totalisant le plus de temps de parole dans la phrase est nettement plus
// robuste à ces chevauchements de frontière.
export function assignSpeakers<T extends { startMs: number; endMs: number; words?: { startMs: number; endMs: number }[] | null }>(
  transcriptSegments: T[],
  diarizationSegments: DiarizationSegment[]
): (T & { speaker: string | null })[] {
  function bestSpeakerForSpan(startMs: number, endMs: number): string | null {
    let bestSpeaker: string | null = null;
    let bestOverlap = 0;
    for (const d of diarizationSegments) {
      const overlap = overlapMs(startMs, endMs, d.startMs, d.endMs);
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestSpeaker = d.speaker;
      }
    }
    return bestSpeaker;
  }

  return transcriptSegments.map((seg) => {
    const words = seg.words && seg.words.length > 0 ? seg.words : [{ startMs: seg.startMs, endMs: seg.endMs }];

    const votes = new Map<string, number>();
    for (const w of words) {
      const speaker = bestSpeakerForSpan(w.startMs, w.endMs);
      if (speaker) votes.set(speaker, (votes.get(speaker) ?? 0) + Math.max(1, w.endMs - w.startMs));
    }

    let bestSpeaker: string | null = null;
    let bestVotes = 0;
    for (const [speaker, weight] of votes) {
      if (weight > bestVotes) {
        bestVotes = weight;
        bestSpeaker = speaker;
      }
    }
    // Repli sur l'ancienne heuristique (recouvrement de la phrase entière) si
    // aucun mot n'a pu être associé individuellement (ex. transcript sans
    // horodatage mot par mot pour cet épisode, cf. transcribeChunk).
    return { ...seg, speaker: bestSpeaker ?? bestSpeakerForSpan(seg.startMs, seg.endMs) };
  });
}
