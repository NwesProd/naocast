import Anthropic from "@anthropic-ai/sdk";

// Module "Intro" : propose automatiquement les meilleurs passages ("hooks")
// du transcript plutôt que de laisser l'utilisateur parcourir toute la liste
// à la main, un appel à l'API Claude, prompt fourni par l'utilisateur
// (chasseur de moments à fort potentiel hook), verbatim.
const HOOK_EXTRACTOR_PROMPT = `# PROMPT - Extracteur de Hook

## RÔLE

Tu es un chasseur de moments. Ton seul métier : lire un transcript vidéo (podcast, vidéo YouTube solo, ou vidéo client) et en extraire les 10 meilleures phrases à fort potentiel hook.

Tu ne résumes pas la vidéo. Tu ne notes pas tout ce qui est "intéressant". Tu cherches les endroits précis où quelqu'un qui scrolle s'arrête net.

## CONTEXTE

Les transcripts viennent d'épisodes de podcast : des conversations et interviews entre plusieurs personnes. Un échange riche et long.

Adapte ton œil au contexte : un moment "quotable" pour un solopreneur qui parle cash de son business n'a pas la même forme qu'un moment fort dans une interview corporate. Mais dans les deux cas, la règle ne change pas : est-ce que ce passage, sorti de son contexte, donne envie de regarder la suite ?

## DÉFINITION D'UN HOOK (non négociable)

Un hook, c'est une phrase qui donne absolument envie de voir la suite. Pas "une phrase qui résume bien le propos". Pas "un moment pertinent". Une phrase courte qui empêche le pouce de scroller.

Si tu hésites entre un passage "solide mais un peu mou" et un passage "plus court mais qui claque direct", tu prends celui qui claque.

## RÈGLES DE SÉLECTION

- **Diversité.** Essaie de ne pas proposer 5 extraits de la même catégorie si le transcript permet mieux. Une bonne sélection finale mélange souvent 2-3 catégories différentes.
- **Verbatim strict.** Le texte de l'extrait doit être copié mot pour mot depuis le transcript. Aucune reformulation, aucun nettoyage des hésitations sauf si elles nuisent vraiment à la compréhension (dans ce cas, signale-le entre crochets plutôt que de les supprimer silencieusement).
- **Pas de chevauchement.** Deux extraits ne doivent pas se recouvrir dans le temps.
- **Durée cible : 5 secondes environ par extraits (compte 2 mots par seconde environ)

## FORMAT DE SORTIE

Pour chaque extrait retenu, dans cet ordre, sans justification ni commentaire ajouté :

\`\`\`
### Extrait [n°]
**Timestamp :** [début] → [fin]
**Durée estimée :** [X secondes]
**Texte :**
"[verbatim exact]"
\`\`\`

Pas de paragraphe d'intro avant la liste, pas de synthèse après. Juste les extraits, un point c'est tout.

## CE QUE TU NE FAIS JAMAIS

- Ne paraphrase jamais le verbatim, même légèrement.
- Ne propose pas de légende, de caption ou de hashtags (ça se gère ailleurs).
- Ne justifie pas tes choix. La sélection doit parler d'elle-même.
- Ne choisis pas un moment juste parce qu'il contient un chiffre ou une stat si la formulation elle-même ne fait pas hook.

## INPUT ATTENDU

Un transcript avec timestamps (format 00:12:34 ou équivalent). S'il manque des timestamps sur certains passages, estime-les à partir des timestamps environnants et signale l'approximation avec un \`~\`.`;

// Haiku : modèle le moins gourmand de la gamme Claude, largement suffisant
// pour une tâche d'extraction/sélection de texte comme celle-ci, à repasser
// sur un modèle plus capable (Sonnet) si la qualité des suggestions déçoit
// en usage réel.
const MODEL = "claude-haiku-4-5-20251001";

interface TranscriptWord {
  text: string;
  startMs: number;
  endMs: number;
}

interface TranscriptSegmentInput {
  startMs: number;
  endMs: number;
  text: string;
  words: TranscriptWord[] | null;
}

export interface IntroHookSuggestion {
  startMs: number;
  endMs: number;
  text: string;
}

function formatTimestamp(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

function buildTranscriptInput(segments: TranscriptSegmentInput[]): string {
  return segments.map((s) => `[${formatTimestamp(s.startMs)}] ${s.text}`).join("\n");
}

// hh:mm:ss OU mm:ss, avec un éventuel "~" d'approximation devant, n'est
// utilisé qu'en repli si le texte verbatim renvoyé ne se retrouve pas tel
// quel dans le transcript (cf. matchWordsForText), les LLM n'étant pas
// fiables pour du minutage précis à partir d'un texte seul.
function parseTimestampToMs(raw: string): number | null {
  const cleaned = raw.trim().replace(/^~/, "").trim();
  const parts = cleaned.split(":").map((p) => Number(p));
  if (parts.length === 0 || parts.some((p) => Number.isNaN(p))) return null;
  let seconds = 0;
  for (const p of parts) seconds = seconds * 60 + p;
  return Math.round(seconds * 1000);
}

function normalizeWord(w: string): string {
  return w
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

// Retrouve les horodatages précis d'un extrait en recherchant sa séquence de
// mots dans le transcript mot-par-mot (Whisper) plutôt que de se fier au
// timestamp estimé par le modèle, un LLM travaillant uniquement sur du
// texte ne peut pas deviner un minutage exact, alors qu'on l'a déjà au mot
// près. Les annotations entre crochets (hésitations signalées, cf. prompt)
// ne font pas partie du verbatim original et sont retirées avant la recherche.
function matchWordsForText(flatWords: TranscriptWord[], hookText: string): { startMs: number; endMs: number } | null {
  const cleanedText = hookText.replace(/\[[^\]]*\]/g, " ");
  const target = cleanedText.split(/\s+/).map(normalizeWord).filter(Boolean);
  if (target.length === 0) return null;

  const normWords = flatWords.map((w) => normalizeWord(w.text));
  for (let i = 0; i <= normWords.length - target.length; i++) {
    if (normWords[i] !== target[0]) continue;
    let matched = true;
    for (let j = 1; j < target.length; j++) {
      if (normWords[i + j] !== target[j]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      return { startMs: flatWords[i].startMs, endMs: flatWords[i + target.length - 1].endMs };
    }
  }
  return null;
}

// Parse le format de sortie imposé au modèle (cf. prompt, section "FORMAT DE
// SORTIE") : un bloc répété par extrait, timestamp, durée, texte entre
// guillemets.
function parseHookBlocks(raw: string): { startRaw: string; endRaw: string; text: string }[] {
  const blocks: { startRaw: string; endRaw: string; text: string }[] = [];
  const regex =
    /###\s*Extrait[^\n]*\n\s*\*\*Timestamp\s*:?\*\*\s*([^\n→]+)→\s*([^\n]+)\n\s*\*\*Durée estimée[^\n]*\n\s*\*\*Texte\s*:?\*\*\s*\n?\s*"([^"]+)"/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw)) !== null) {
    blocks.push({ startRaw: match[1].trim(), endRaw: match[2].trim(), text: match[3].trim() });
  }
  return blocks;
}

export async function suggestIntroHooks(transcriptSegments: TranscriptSegmentInput[]): Promise<IntroHookSuggestion[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY manquant : configurez une clé API pour activer la suggestion automatique (voir .env).");
  }
  if (transcriptSegments.length === 0) {
    throw new Error("Aucun transcript disponible pour cet épisode.");
  }

  const client = new Anthropic({ apiKey });
  const transcriptInput = buildTranscriptInput(transcriptSegments);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: HOOK_EXTRACTOR_PROMPT,
    messages: [{ role: "user", content: transcriptInput }],
  });

  const raw = response.content.map((block) => (block.type === "text" ? block.text : "")).join("\n");
  const blocks = parseHookBlocks(raw);

  const flatWords: TranscriptWord[] = [];
  for (const seg of transcriptSegments) {
    const words = seg.words && seg.words.length > 0 ? seg.words : [{ text: seg.text, startMs: seg.startMs, endMs: seg.endMs }];
    flatWords.push(...words);
  }

  const suggestions: IntroHookSuggestion[] = [];
  for (const block of blocks) {
    const matched = matchWordsForText(flatWords, block.text);
    if (matched) {
      suggestions.push({ startMs: matched.startMs, endMs: matched.endMs, text: block.text });
      continue;
    }
    // Repli : le verbatim ne s'est pas retrouvé tel quel (rare, ex. légère
    // divergence malgré la consigne stricte), on garde quand même la
    // suggestion, avec les timestamps estimés par le modèle plutôt que de la
    // perdre entièrement.
    const startMs = parseTimestampToMs(block.startRaw);
    const endMs = parseTimestampToMs(block.endRaw);
    if (startMs !== null && endMs !== null && endMs > startMs) {
      suggestions.push({ startMs, endMs, text: block.text });
    }
  }

  return suggestions.sort((a, b) => a.startMs - b.startMs);
}
