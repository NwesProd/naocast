import Anthropic from "@anthropic-ai/sdk";

// Étape "Cut" du tunnel de montage : l'IA relit le transcript et propose les
// passages à retirer au montage (ratés, faux départs, reprises, apartés hors
// épisode...). Travail au niveau de la PHRASE (segment du transcript) : le
// modèle renvoie des plages d'identifiants de phrases, jamais des minutages
// inventés, les horodatages viennent du transcript lui-même. L'utilisateur
// accepte ou refuse chaque proposition, rien n'est coupé automatiquement.
const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `Tu es monteur de podcast. Tu relis le transcript brut d'un épisode enregistré en une prise, et tu repères les passages à COUPER au montage parce qu'ils n'ont pas leur place dans l'épisode final.

À couper :
- les ratés : phrase commencée puis abandonnée, faux départ, bafouillage, mot cherché trop longtemps ;
- les reprises : une même phrase ou idée redite parce que la première version était ratée. Coupe la version RATÉE, qui est presque toujours la première, avec tout ce qui la sépare de la reprise (échange technique, "on refait"), et garde la dernière version ;
- les échanges techniques ou de régie : "on coupe", "ça enregistre ?", "attends je refais", "tu m'entends ?", réglages de micro ou de caméra ;
- les apartés hors sujet sans valeur pour l'auditeur (interruptions extérieures, conversation privée, bruits commentés) ;
- les longs passages vides de sens (euh à répétition, blanc rempli de remplissage).

À NE PAS couper :
- les hésitations légères et naturelles, le rythme de la conversation, l'humour, les digressions qui nourrissent le sujet ;
- tout ce dont tu n'es pas raisonnablement sûr : en cas de doute, ne propose rien. Mieux vaut peu de propositions pertinentes que beaucoup de bruit.

Le transcript est une liste de phrases, une par ligne, au format :
#<id> [hh:mm:ss] Locuteur : texte

Réponds UNIQUEMENT par un tableau JSON, sans aucun texte autour, au format :
[{"from": <numéro de la première phrase à couper>, "to": <numéro de la dernière phrase à couper>, "reason": "<raison courte, en français, 12 mots maximum>"}]

"from" et "to" sont des NOMBRES ENTIERS (le numéro après le #, sans le #) présents dans le transcript, "from" avant ou égal à "to". Plusieurs phrases consécutives à couper forment UNE seule proposition. Les propositions ne se chevauchent pas. Si rien n'est à couper, réponds [].`;

export interface CutSuggestionInput {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  speaker: string | null;
}

export interface CutSuggestionResult {
  startMs: number;
  endMs: number;
  text: string;
  reason: string;
}

const MAX_TRANSCRIPT_CHARS = 400_000;
const MAX_SUGGESTIONS = 80;

function formatTimestamp(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

// Extrait le premier tableau JSON de la réponse, même si le modèle l'entoure
// de texte ou de balises de code malgré la consigne.
function extractJsonArray(raw: string): unknown {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end <= start) throw new Error("Réponse de l'IA illisible.");
  return JSON.parse(raw.slice(start, end + 1));
}

export async function suggestCuts(
  segments: CutSuggestionInput[],
  speakerNames: Record<string, string>
): Promise<CutSuggestionResult[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY manquant : configurez une clé API pour activer la détection des passages à couper.");
  }
  if (segments.length === 0) throw new Error("Aucun transcript disponible pour cet épisode.");

  // Identifiants courts (numéro d'ordre) plutôt que les cuid de la base :
  // moins de tokens, et le modèle ne peut pas en inventer de crédibles.
  const lines = segments.map((s, i) => {
    const who = s.speaker ? (speakerNames[s.speaker] || s.speaker) : null;
    return `#${i} [${formatTimestamp(s.startMs)}] ${who ? `${who} : ` : ""}${s.text}`;
  });
  const transcriptInput = lines.join("\n");
  if (transcriptInput.length > MAX_TRANSCRIPT_CHARS) {
    throw new Error("Transcript trop long pour l'analyse automatique.");
  }

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: transcriptInput }],
  });
  const raw = response.content.map((block) => (block.type === "text" ? block.text : "")).join("\n");

  const parsed = extractJsonArray(raw);
  if (!Array.isArray(parsed)) throw new Error("Réponse de l'IA illisible.");

  const results: CutSuggestionResult[] = [];
  let lastTo = -1;
  // Le modèle renvoie parfois "#12" ou "12" au lieu du nombre 12 : on accepte les trois.
  const toIndex = (value: unknown): number =>
    typeof value === "number" ? value : typeof value === "string" ? parseInt(value.replace("#", ""), 10) : NaN;
  const sorted = (parsed as { from?: unknown; to?: unknown; reason?: unknown }[])
    .map((p) => ({ from: toIndex(p.from), to: toIndex(p.to), reason: typeof p.reason === "string" ? p.reason : "Passage à couper" }))
    .filter((p) => Number.isInteger(p.from) && Number.isInteger(p.to))
    .filter((p) => p.from >= 0 && p.to < segments.length && p.from <= p.to)
    .sort((a, b) => a.from - b.from);

  for (const p of sorted) {
    if (p.from <= lastTo) continue; // chevauchement : on garde la première
    lastTo = p.to;
    const covered = segments.slice(p.from, p.to + 1);
    results.push({
      startMs: covered[0].startMs,
      endMs: covered[covered.length - 1].endMs,
      text: covered.map((s) => s.text).join(" "),
      reason: p.reason.slice(0, 160),
    });
    if (results.length >= MAX_SUGGESTIONS) break;
  }
  return results;
}
