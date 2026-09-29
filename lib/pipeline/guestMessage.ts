import Anthropic from "@anthropic-ai/sdk";

// Module "Invités" : rédige directement le message à envoyer aux invités
// d'un épisode, à partir du peu qu'on connaît déjà (podcast, épisode,
// invités), pas de formulaire à remplir en amont : les points qu'on ne
// connaît pas (sujet précis, date, lieu, liens...) sont laissés en
// [à compléter] plutôt qu'inventés, à charge pour l'utilisateur de les
// remplir en éditant le message généré.
const GUEST_MESSAGE_PROMPT = `Tu rédiges, pour le compte d'un podcasteur, le message à envoyer à ses invités avant l'enregistrement d'un épisode.

Ton : chaleureux, direct, professionnel sans être guindé, comme un email qu'on enverrait vraiment à quelqu'un qu'on est content de recevoir.

Tu ne disposes que du nom du podcast, du nom de l'épisode et du/des prénom(s) de l'invité(s), rien de plus. Le message doit quand même couvrir ces points, dans cet ordre :
- Un mot d'accueil personnalisé avec le(s) prénom(s) de l'invité(s), et une phrase sur le sujet de l'épisode.
- Ce qu'il y a éventuellement à préparer en amont.
- La date et le lieu du tournage, avec les indications pratiques.
- Un lien vers le podcast (épisodes précédents, site...).

Comme tu ne connais pas ces informations précises (sujet exact, choses à préparer, date, lieu, indications, lien), remplace-les par un espace entre crochets à compléter à la main, par exemple [sujet de l'épisode], [date], [lieu], [lien du podcast]. N'invente jamais un détail que tu ne connais pas. Ne mets pas de crochets pour ce que tu connais déjà (nom du podcast, de l'épisode, prénom(s) de l'invité).

Termine par une formule de politesse simple, signée au nom du podcast.

Renvoie uniquement le texte du message, prêt à copier-coller tel quel dans un email. Pas de titre, pas d'objet d'email, pas de commentaire avant ou après. Pas de formatage markdown (pas de **gras**, pas de listes à puces, pas de titres), jamais de tiret cadratin "—" : du texte brut uniquement.`;

// Haiku : suffisant pour une tâche de rédaction courte et cadrée comme
// celle-ci, cohérent avec le choix déjà fait pour les suggestions de hooks
// (cf. lib/pipeline/introSuggestions.ts), à repasser sur un modèle plus
// capable si le ton déçoit en usage réel.
const MODEL = "claude-haiku-4-5-20251001";

export interface GuestMessageInput {
  podcastTitle: string;
  episodeLabel: string;
  guestNames: string[];
}

function buildUserMessage(input: GuestMessageInput): string {
  return [
    `Podcast : ${input.podcastTitle}`,
    `Épisode : ${input.episodeLabel}`,
    `Invité(s) : ${input.guestNames.length > 0 ? input.guestNames.join(", ") : "(non précisé, garde une formule d'accueil générique)"}`,
  ].join("\n");
}

export async function generateGuestMessage(input: GuestMessageInput): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY manquant : configurez une clé API pour activer la génération du message (voir .env).");
  }

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: GUEST_MESSAGE_PROMPT,
    messages: [{ role: "user", content: buildUserMessage(input) }],
  });

  return response.content.map((block) => (block.type === "text" ? block.text : "")).join("\n").trim();
}
