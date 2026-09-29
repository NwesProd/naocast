import { NextResponse } from "next/server";
import path from "path";
import { prisma } from "@/lib/db";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";
import { putLocalFile, getSignedDownloadUrl } from "@/lib/storage";
import { buildBody, workDirFor } from "@/lib/pipeline/render";
import { assembleClipsInOrder } from "@/lib/pipeline/ffmpeg";

// Mêmes constantes et même logique d'extension des coupures que le rendu
// final (cf. lib/pipeline/render.ts, renderVideo) : une coupure au ras des
// horodatages du mot retiré laisse souvent un petit silence, une respiration
// ou un "euh"/"bah" juste avant/après (les horodatages Whisper ne collent pas
// pixel-près à l'audio réel). On étend donc chaque coupure jusqu'au mot
// CONSERVÉ voisin (avec une marge pour ne pas mordre dessus), pas seulement
// autour du mot retiré lui-même.
const CUT_LOOKBACK_MS = 150;
const CUT_LOOKAHEAD_MS = 80;
const CUT_START_BUFFER_MS = 60;
const CUT_END_BUFFER_MS = 60;

interface Word {
  startMs: number;
  endMs: number;
}

function nextWordStartAfter(words: Word[], ms: number): number | null {
  return words.find((w) => w.startMs > ms)?.startMs ?? null;
}
function previousWordEndBefore(words: Word[], ms: number): number | null {
  let result: number | null = null;
  for (const w of words) {
    if (w.endMs > ms) break;
    result = w.endMs;
  }
  return result;
}

// Sous-plages conservées d'un passage, une fois ses mots retirés (removedRanges,
// mode "cut" du module) exclus, même logique que computeKeepRanges (cf.
// lib/pipeline/ffmpeg.ts) mais bornée à [seg.startMs, seg.endMs] plutôt qu'à
// la durée totale du fichier. `words` (TOUS les mots de l'épisode, triés) sert
// à trouver le mot conservé voisin pour étendre chaque coupure ; l'extension
// reste toujours plafonnée aux bornes du passage lui-même, jamais au-delà,
// chaque IntroSegment est extrait isolément, pas de contenu voisin hors de
// cette plage à mordre dessus.
function keepRangesForSegment(seg: { startMs: number; endMs: number; removedRanges: unknown }, words: Word[]) {
  const removed = Array.isArray(seg.removedRanges) ? (seg.removedRanges as { startMs: number; endMs: number }[]) : [];
  const sorted = [...removed].sort((a, b) => a.startMs - b.startMs);
  const keep: { startSec: number; endSec: number }[] = [];
  let cursor = seg.startMs;
  for (const r of sorted) {
    const previousWordEnd = previousWordEndBefore(words, r.startMs);
    const extendedStart =
      previousWordEnd !== null
        ? Math.min(r.startMs - CUT_LOOKBACK_MS, previousWordEnd + CUT_START_BUFFER_MS)
        : r.startMs - CUT_LOOKBACK_MS;

    const nextWordStart = nextWordStartAfter(words, r.endMs);
    const extendedEnd =
      nextWordStart !== null ? Math.max(r.endMs, nextWordStart - CUT_END_BUFFER_MS) : r.endMs + CUT_LOOKAHEAD_MS;

    const rs = Math.max(extendedStart, seg.startMs, cursor);
    const re = Math.min(extendedEnd, seg.endMs);
    if (rs >= re) continue;
    if (rs > cursor) keep.push({ startSec: cursor / 1000, endSec: rs / 1000 });
    cursor = Math.max(cursor, re);
  }
  if (cursor < seg.endMs) keep.push({ startSec: cursor / 1000, endSec: seg.endMs / 1000 });
  return keep;
}

// Module "Intro" : assemble les passages choisis (dans l'ordre choisi) en un
// seul clip, le teaser diffusé avant le générique de début.
//
// Réponse en NDJSON (une ligne JSON par évènement) plutôt qu'une simple
// réponse bloquante : le client affiche la progression % (ffmpeg) pendant que
// ça tourne au lieu d'un texte statique "Génération en cours..." sans retour,
// potentiellement long sur un teaser qui compile beaucoup de passages.
//
// Extrait depuis body.mp4 (comme les CutMarker de l'étape "Cut") : le
// transcript est généré à partir d'UN SEUL rush choisi par l'utilisateur, dont
// les horodatages ne s'alignent avec body.mp4 que si ce rush est bien le
// premier de la concaténation (limite déjà présente pour les découpes
// manuelles, pas spécifique à ce module).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId } = await params;
  await requireOwnedEpisode(userId, episodeId);

  const segments = await prisma.introSegment.findMany({ where: { episodeId }, orderBy: { order: "asc" } });
  if (segments.length === 0) {
    return NextResponse.json({ error: "Aucun passage sélectionné pour le teaser." }, { status: 400 });
  }

  const transcriptSegments = await prisma.transcriptSegment.findMany({ where: { episodeId } });
  const words: Word[] = transcriptSegments
    .flatMap((s) => (s.words as Word[] | null) ?? [{ startMs: s.startMs, endMs: s.endMs }])
    .sort((a, b) => a.startMs - b.startMs);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (data: unknown) => controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
      try {
        const bodyPath = await buildBody(episodeId);
        const dir = workDirFor(episodeId);
        const teaserPath = path.join(dir, "intro-teaser.mp4");

        await assembleClipsInOrder(
          bodyPath,
          teaserPath,
          segments.flatMap((s) => keepRangesForSegment(s, words)),
          (fraction) => send({ progress: fraction })
        );

        const storageKey = `episodes/${episodeId}/intro-teaser.mp4`;
        await putLocalFile(storageKey, teaserPath, "video/mp4");

        // Reconstruire le teaser invalide toute validation précédente : le
        // clip vient de changer, une validation antérieure porterait sur un
        // contenu obsolète (cf. Episode.introTeaserValidated, lib/pipeline/render.ts).
        const episode = await prisma.episode.update({
          where: { id: episodeId },
          data: { introTeaserKey: storageKey, introTeaserValidated: false },
        });

        const url = await getSignedDownloadUrl(storageKey);
        send({ done: true, episode, url: `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}` });
      } catch (err) {
        send({ error: (err as Error).message || "Échec de la génération de l'intro." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8" } });
}
