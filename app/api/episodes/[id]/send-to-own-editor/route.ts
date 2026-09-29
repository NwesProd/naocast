import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";
import { sendEpisodeToOwnEditor } from "@/lib/email";

// Étape "1. Monteur" → "J'ai déjà un monteur" → "Je lui envoie les rushs et
// lui donne des indications" : contrairement à NEED_EDITOR (monteur naocast.,
// payant), l'épisode passe tout le tunnel puis, à l'étape "Lancer", envoie
// un récapitulatif par email au monteur personnel de l'utilisateur,
// aucune facturation naocast., aucun traitement automatique déclenché.
const bodySchema = z.object({ email: z.string().email() });

const CAMERA_SETUP_LABEL: Record<string, string> = {
  PRE_EDITED: "Pré-montage déjà fait (ou caméra unique)",
  MULTI_CAMERA: "Caméras séparées, non synchronisées",
};

const CUSTOM_MODE_LABEL: Record<string, string> = {
  TEASER_COMPILATION: "Compiler les meilleurs extraits en teaser",
  OWN_IDEA: "Idée du podcasteur (voir description)",
};

function genericSummary(
  label: string,
  source: string,
  creationMode: string | null,
  customMode: string | null,
  customDescription: string | null,
  hasFile: boolean
): string {
  if (source === "PODCAST") return `<li><strong>${label} :</strong> générique standard du podcast</li>`;
  if (creationMode === "IMPORT" || !creationMode) {
    return `<li><strong>${label} :</strong> fichier spécifique ${hasFile ? "importé sur naocast." : "(non fourni)"}</li>`;
  }
  const modeLabel = customMode ? CUSTOM_MODE_LABEL[customMode] : "à créer";
  const desc = customMode === "OWN_IDEA" && customDescription ? `<br/>« ${customDescription} »` : "";
  return `<li><strong>${label} :</strong> à créer sur-mesure (${modeLabel})${desc}</li>`;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId } = await params;
  await requireOwnedEpisode(userId, episodeId);

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Adresse email invalide." }, { status: 400 });

  const episode = await prisma.episode.findUniqueOrThrow({
    where: { id: episodeId },
    include: {
      podcast: { include: { user: true } },
      rushes: { orderBy: { createdAt: "asc" } },
      cutMarkers: { orderBy: { startMs: "asc" } },
    },
  });

  const rushesList = episode.rushes
    .filter((r) => r.selectedForEpisode)
    .map((r) => `<li>${r.originalFilename || r.externalRef || `(${r.type})`}</li>`)
    .join("");

  const cutsList = episode.cutMarkers
    .map((m) => `<li>${(m.startMs / 1000).toFixed(0)}s → ${(m.endMs / 1000).toFixed(0)}s</li>`)
    .join("");

  const html = `
    <h1>Nouvel épisode à monter : ${episode.podcast.title}</h1>
    <h2>${episode.title || "Sans titre"}</h2>
    <p><strong>Type de tournage :</strong> ${episode.cameraSetup ? CAMERA_SETUP_LABEL[episode.cameraSetup] : "non précisé"}</p>
    <h3>Rushs sélectionnés</h3>
    <ul>${rushesList || "<li>Aucun</li>"}</ul>
    <h3>Passages à couper</h3>
    <ul>${cutsList || "<li>Aucun</li>"}</ul>
    <h3>Génériques</h3>
    <ul>
      ${genericSummary("Début", episode.introSource, episode.introCreationMode, episode.introCustomMode, episode.introCustomDescription, !!episode.introKey)}
      ${genericSummary("Fin", episode.outroSource, episode.outroCreationMode, episode.outroCustomMode, episode.outroCustomDescription, !!episode.outroKey)}
    </ul>
    <p><em>Envoyé depuis naocast. par ${episode.podcast.user.email}.</em></p>
  `;

  await sendEpisodeToOwnEditor(parsed.data.email, `Épisode à monter : ${episode.title || episode.podcast.title}`, html);

  const updated = await prisma.episode.update({
    where: { id: episodeId },
    data: {
      ownEditorEmail: parsed.data.email,
      status: "HUMAN_EDITOR_REQUESTED",
      humanEditorRequestedAt: new Date(),
    },
  });
  return NextResponse.json(updated);
}
