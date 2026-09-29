import Anthropic from "@anthropic-ai/sdk";

// Module "Script" : propose des idées d'angles et de thèmes pour un épisode
// précis, à partir de la bible du podcast (positionnement, ligne éditoriale,
// thèmes principaux, douleurs de la cible) et, s'ils existent déjà, des
// invités de cet épisode. Une liste de pistes pour démarrer, pas un script
// rédigé (hors scope pour l'instant).
const SCRIPT_IDEAS_PROMPT = `Tu es un consultant éditorial pour un podcast. À partir de la bible du podcast fournie (positionnement, ligne éditoriale, thèmes principaux, douleurs de la cible), si mentionnés des invités de cet épisode, et d'éventuelles notes déjà écrites par le podcasteur, propose des idées d'angles et de thèmes pour CET épisode en particulier.

Propose 6 à 8 idées. Chacune doit être ancrée dans la bible (un thème ou une douleur de la cible qui y est mentionné), si des invités sont fournis tenir compte de leur profil ou de leur média, et si des notes du podcasteur sont fournies, prolonger ou préciser ce qu'elles évoquent plutôt que les ignorer. Ne propose pas d'idées génériques déconnectées de la bible fournie.

Format de sortie, une idée par ligne, rien d'autre avant ou après :
Titre court de l'angle : explication en une phrase de pourquoi cet angle fonctionne pour ce podcast.

Pas de markdown, pas de puces, pas de numérotation, jamais de tiret cadratin "—".`;

// Tâche de créativité éditoriale ancrée dans la bible, comme la génération
// de la bible elle-même (cf. lib/pipeline/podcastBible.ts) : mérite le
// modèle le plus capable plutôt qu'un choix économique.
const MODEL = "claude-opus-5-5";

export interface ScriptIdeasInput {
  episodeLabel: string;
  bible: string;
  guestDescriptions: string[];
  draftNotes?: string;
}

function buildUserMessage(input: ScriptIdeasInput): string {
  return [
    `Épisode : ${input.episodeLabel}`,
    input.guestDescriptions.length > 0 ? `Invité(s) de cet épisode : ${input.guestDescriptions.join(", ")}` : "",
    input.draftNotes?.trim() ? `Notes déjà écrites par le podcasteur :\n${input.draftNotes.trim()}` : "",
    `Bible du podcast :\n${input.bible}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function generateScriptIdeas(input: ScriptIdeasInput): Promise<string[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY manquant : configurez une clé API pour activer la génération d'idées (voir .env).");
  }

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    output_config: { effort: "high" },
    system: SCRIPT_IDEAS_PROMPT,
    messages: [{ role: "user", content: buildUserMessage(input) }],
  });

  const raw = response.content.map((block) => (block.type === "text" ? block.text : "")).join("\n");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}
