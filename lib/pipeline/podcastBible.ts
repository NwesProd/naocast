import Anthropic from "@anthropic-ai/sdk";

// Onglet "ADN" (Mon podcast) : génère la bible du podcast à partir de l'ADN
// renseigné par l'utilisateur (texte libre guidé par des questions côté UI)
// et d'éventuels documents de référence (bible existante, notes...). La
// bible générée reste ensuite librement modifiable par l'utilisateur.
const PODCAST_BIBLE_PROMPT = `Tu es un consultant éditorial spécialisé dans le positionnement de podcasts. À partir des éléments fournis par le podcasteur (le texte décrivant l'ADN de son podcast, et d'éventuels documents de référence comme une bible existante), rédige une bible complète et structurée pour ce podcast.

La bible doit couvrir, dans cet ordre, avec un titre de section en MAJUSCULES suivi de deux points pour chacune :

POSITIONNEMENT : qu'est-ce que ce podcast, à qui s'adresse-t-il, pourquoi existe-t-il.
LIGNE ÉDITORIALE : le ton, le format, la manière de traiter les sujets.
RÈGLES : les règles ou principes que le podcasteur souhaite respecter (si mentionnés dans les éléments fournis).
THÈMES PRINCIPAUX : une liste de 5 à 10 thèmes récurrents du podcast, sous forme de hashtags (ex. #Entrepreneuriat #Créativité #Échec).
DOULEURS DE LA CIBLE : les principales douleurs, frustrations ou questions que se pose l'audience cible, et que ce podcast vient adresser.

N'invente rien qui contredise les éléments fournis. Si une section manque clairement d'information dans ce qui a été fourni, dis-le brièvement (ex. "à préciser") plutôt que d'improviser un contenu générique à sa place.

Réponds uniquement avec le texte de la bible, en texte brut structuré comme décrit ci-dessus (pas de markdown, pas de **gras**, pas de listes à puces autres que les hashtags, jamais de tiret cadratin "—"). Pas de commentaire avant ou après.`;

// Bible = document de référence structurant pour tout le reste du contenu du
// podcast (thèmes, douleurs de la cible...) : mérite le modèle le plus
// capable plutôt qu'un choix économique comme pour l'extraction de hooks ou
// le message aux invités (tâches plus mécaniques).
const MODEL = "claude-opus-5-5";

export interface ReferenceFileInput {
  filename: string;
  mimeType: string;
  buffer: Buffer;
}

export interface PodcastBibleInput {
  title: string;
  dna: string | null;
  referenceFiles: ReferenceFileInput[];
}

export async function generatePodcastBible(input: PodcastBibleInput): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY manquant : configurez une clé API pour activer la génération de la bible (voir .env).");
  }
  if (!input.dna?.trim() && input.referenceFiles.length === 0) {
    throw new Error("Renseignez d'abord l'ADN du podcast ou importez un document de référence.");
  }

  const client = new Anthropic({ apiKey });

  const content: Anthropic.MessageParam["content"] = [];

  for (const file of input.referenceFiles) {
    if (file.mimeType === "application/pdf") {
      content.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: file.buffer.toString("base64") },
      });
    } else {
      // .txt/.md (seuls autres types acceptés à l'upload, cf. accept= côté
      // formulaire) : contenu texte inclus directement dans le message.
      content.push({
        type: "text",
        text: `--- Document de référence : ${file.filename} ---\n${file.buffer.toString("utf-8")}`,
      });
    }
  }

  content.push({
    type: "text",
    text: [`Podcast : ${input.title}`, input.dna?.trim() ? `ADN renseigné par le podcasteur :\n${input.dna.trim()}` : ""]
      .filter(Boolean)
      .join("\n\n"),
  });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    output_config: { effort: "high" },
    system: PODCAST_BIBLE_PROMPT,
    messages: [{ role: "user", content }],
  });

  return response.content.map((block) => (block.type === "text" ? block.text : "")).join("\n").trim();
}
