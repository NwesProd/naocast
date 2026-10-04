import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { appUrl, sendEmail } from "@/lib/email";

// Demande de montage par un monteur naocast. (tunnel "J'ai besoin d'un monteur",
// étape "Envoi") : l'utilisateur ajoute ses remarques, paie via Stripe Checkout,
// puis, une fois le paiement confirmé, la demande est transmise par email à
// l'équipe et consultable dans l'onglet "Montages" du back office.

// Prix Stripe de la prestation (modifiable par variable d'environnement).
export const EDITING_PRICE_ID = process.env.STRIPE_PRICE_EDITING || "price_1UI6eBGVMsyYVgruJCXlCArk";
export const EDITING_REQUEST_EMAIL = process.env.EDITING_REQUEST_EMAIL || "contact@nwes.fr";

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const CAMERA_SETUP_LABEL: Record<string, string> = {
  PRE_EDITED: "Pré-montage déjà fait (ou caméra unique) : fichiers à mettre bout à bout",
  MULTI_CAMERA: "Caméras séparées, non synchronisées",
};

const CUSTOM_MODE_LABEL: Record<string, string> = {
  TEASER_COMPILATION: "Compiler les meilleurs extraits en teaser",
  OWN_IDEA: "Idée du podcasteur",
};

const LOGO_POSITION_LABEL: Record<string, string> = {
  TOP_LEFT: "en haut à gauche",
  TOP_RIGHT: "en haut à droite",
  BOTTOM_LEFT: "en bas à gauche",
  BOTTOM_RIGHT: "en bas à droite",
};

export function formatMs(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

export interface EditingSummary {
  podcastTitle: string;
  episodeTitle: string;
  episodeCode: string;
  releaseDate: Date | null;
  cameraSetup: string | null;
  expectedSpeakerCount: number | null;
  speakers: string[];
  hasTranscript: boolean;
  autocut: string;
  rushes: { id: string; name: string; type: string; externalRef: string | null; storageKey: string | null; durationSec: number | null; sizeBytes: number | null; selected: boolean }[];
  cuts: { startMs: number; endMs: number; source: string }[];
  generics: { label: string; text: string }[];
  logo: string;
  intro: string;
}

function genericLine(
  source: string,
  creationMode: string | null,
  customMode: string | null,
  customDescription: string | null,
  hasFile: boolean
): string {
  if (source === "PODCAST") return "Générique standard du podcast";
  if (creationMode === "IMPORT" || !creationMode) return hasFile ? "Fichier spécifique importé sur naocast." : "Fichier spécifique (non fourni)";
  const mode = customMode ? CUSTOM_MODE_LABEL[customMode] : "À créer";
  const desc = customMode === "OWN_IDEA" && customDescription ? ` : « ${customDescription} »` : "";
  return `À créer sur-mesure (${mode})${desc}`;
}

// Récapitulatif de l'épisode tel qu'il est au moment de la lecture (rushs, coupes,
// génériques, logo...), partagé par l'email et la fiche du back office.
export async function buildEditingSummary(episodeId: string): Promise<EditingSummary | null> {
  const episode = await prisma.episode.findUnique({ where: { id: episodeId } });
  if (!episode) return null;
  const podcast = await prisma.podcast.findUnique({ where: { id: episode.podcastId } });
  const rushes = await prisma.rushSource.findMany({ where: { episodeId }, orderBy: { createdAt: "asc" } });
  const cuts = await prisma.cutMarker.findMany({ where: { episodeId }, orderBy: { startMs: "asc" } });
  const speakers = await prisma.episodeSpeaker.findMany({ where: { episodeId }, orderBy: { label: "asc" } });
  const transcriptCount = await prisma.transcriptSegment.count({ where: { episodeId } });

  const code = [episode.season != null ? `S${episode.season}` : null, episode.episodeNumber != null ? `E${episode.episodeNumber}` : null]
    .filter(Boolean)
    .join("");

  const introTeaser =
    episode.introTeaserChoice === "MODULE"
      ? `Teaser composé dans naocast.${episode.introTeaserValidated ? " (validé)" : " (non validé)"}`
      : episode.introTeaserChoice === "IMPORT"
        ? "Teaser importé"
        : "Aucun teaser";

  return {
    podcastTitle: podcast?.title ?? "",
    episodeTitle: episode.title || "Sans titre",
    episodeCode: code,
    releaseDate: episode.releaseDate,
    cameraSetup: episode.cameraSetup ? CAMERA_SETUP_LABEL[episode.cameraSetup] : null,
    expectedSpeakerCount: episode.expectedSpeakerCount,
    speakers: speakers.map((s, i) => s.displayName || `Locuteur ${i + 1}`),
    hasTranscript: transcriptCount > 0,
    autocut: episode.autocutEnabled
      ? `Couper les silences${episode.autocutSilenceMs ? ` (à partir de ${episode.autocutSilenceMs / 1000} s)` : ""}`
      : "Pas de coupe automatique des silences",
    rushes: rushes.map((r) => ({
      id: r.id,
      name: r.originalFilename || r.externalRef || `(${r.type})`,
      type: r.type,
      externalRef: r.externalRef,
      storageKey: r.storageKey,
      durationSec: r.durationSec,
      sizeBytes: r.fileSizeBytes != null ? Number(r.fileSizeBytes) : null,
      selected: r.selectedForEpisode,
    })),
    cuts: cuts.map((c) => ({ startMs: c.startMs, endMs: c.endMs, source: c.source })),
    generics: [
      { label: "Début", text: genericLine(episode.introSource, episode.introCreationMode, episode.introCustomMode, episode.introCustomDescription, !!episode.introKey) },
      { label: "Fin", text: genericLine(episode.outroSource, episode.outroCreationMode, episode.outroCustomMode, episode.outroCustomDescription, !!episode.outroKey) },
    ],
    logo: episode.logoEnabled
      ? `Logo du podcast ${LOGO_POSITION_LABEL[episode.logoPosition] ?? ""}${episode.logoOnIntro ? ", sur le générique de début" : ""}${episode.logoOnOutro ? ", sur le générique de fin" : ""}`.trim()
      : "Sans logo sur cet épisode",
    intro: introTeaser,
  };
}

function section(title: string, body: string): string {
  return `<h3 style="margin:20px 0 6px">${title}</h3>${body}`;
}

export function renderEditingEmail(
  request: { id: string; userEmail: string; notes: string | null; amountTotal: number | null; currency: string | null },
  summary: EditingSummary
): { subject: string; html: string } {
  const rushes = summary.rushes
    .map((r) => `<li>${escapeHtml(r.name)}${r.durationSec ? ` (${formatMs(r.durationSec * 1000)})` : ""}${r.selected ? "" : " : non retenu"}${r.externalRef ? ` : ${escapeHtml(r.externalRef)}` : ""}</li>`)
    .join("");
  const cuts = summary.cuts.map((c) => `<li>${formatMs(c.startMs)} → ${formatMs(c.endMs)}${c.source === "AUTOCUT" ? " (silence)" : ""}</li>`).join("");
  const amount = request.amountTotal != null ? `${(request.amountTotal / 100).toFixed(2).replace(".", ",")} ${(request.currency || "eur").toUpperCase()}` : null;
  const title = `${summary.episodeCode ? `${summary.episodeCode} ` : ""}${summary.episodeTitle}`;

  const html = `
    <h1 style="margin:0 0 4px">Nouvelle demande de montage</h1>
    <p style="margin:0;color:#555">${escapeHtml(summary.podcastTitle)} : ${escapeHtml(title)}</p>
    <p><strong>Podcasteur :</strong> ${escapeHtml(request.userEmail)}${amount ? `<br/><strong>Paiement :</strong> ${amount} reçu` : ""}</p>
    ${section("Remarques du podcasteur", request.notes ? `<p style="white-space:pre-wrap">${escapeHtml(request.notes)}</p>` : "<p><em>Aucune remarque.</em></p>")}
    ${section("Rushs", `<ul>${rushes || "<li>Aucun</li>"}</ul>${summary.cameraSetup ? `<p>${escapeHtml(summary.cameraSetup)}</p>` : ""}`)}
    ${section("Voix", `<p>${summary.expectedSpeakerCount ? `${summary.expectedSpeakerCount} voix attendues` : "Nombre de voix non précisé"}${summary.speakers.length ? ` : ${escapeHtml(summary.speakers.join(", "))}` : ""}. ${summary.hasTranscript ? "Transcript disponible." : "Pas de transcript."}</p>`)}
    ${section("Coupes", `<p>${escapeHtml(summary.autocut)}</p><ul>${cuts || "<li>Aucune coupe manuelle</li>"}</ul>`)}
    ${section("Intro, génériques et logo", `<ul><li>Intro : ${escapeHtml(summary.intro)}</li>${summary.generics.map((g) => `<li>Générique de ${g.label.toLowerCase()} : ${escapeHtml(g.text)}</li>`).join("")}<li>${escapeHtml(summary.logo)}</li></ul>`)}
    <p style="margin-top:24px"><a href="${appUrl()}/admin/montages/${request.id}">Voir la demande dans le back office</a> (rushs téléchargeables)</p>
  `;
  return { subject: `Demande de montage : ${summary.podcastTitle} / ${title}`, html };
}

// Confirme le paiement d'une demande (appelé par le webhook Stripe ET au retour
// de l'utilisateur sur le site, le premier arrivé fait le travail) : marque la
// demande payée, bascule l'épisode chez le monteur et envoie l'email à l'équipe.
// Idempotent : plusieurs appels ne créent ni doublon ni second email.
export async function finalizeEditingRequest(requestId: string, session: Stripe.Checkout.Session): Promise<void> {
  if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") return;

  await prisma.editingRequest.updateMany({
    where: { id: requestId, status: "PENDING_PAYMENT" },
    data: { status: "PAID", paidAt: new Date(), amountTotal: session.amount_total ?? null, currency: session.currency ?? null },
  });

  const request = await prisma.editingRequest.findUnique({ where: { id: requestId } });
  if (!request || request.status !== "PAID") return;

  if (request.episodeId) {
    await prisma.episode.updateMany({
      where: { id: request.episodeId, status: { notIn: ["EXPORTED"] } },
      data: { status: "HUMAN_EDITOR_REQUESTED", humanEditorRequestedAt: new Date() },
    });
  }

  // Un seul envoi : celui qui "réserve" emailSentAt envoie, les autres passent.
  const claimed = await prisma.editingRequest.updateMany({ where: { id: requestId, emailSentAt: null }, data: { emailSentAt: new Date() } });
  if (claimed.count === 0) return;

  try {
    const summary = request.episodeId ? await buildEditingSummary(request.episodeId) : null;
    const { subject, html } = renderEditingEmail(request, summary ?? {
      podcastTitle: request.podcastTitle ?? "",
      episodeTitle: request.episodeTitle ?? "Sans titre",
      episodeCode: "",
      releaseDate: null,
      cameraSetup: null,
      expectedSpeakerCount: null,
      speakers: [],
      hasTranscript: false,
      autocut: "",
      rushes: [],
      cuts: [],
      generics: [],
      logo: "",
      intro: "",
    });
    await sendEmail({ to: EDITING_REQUEST_EMAIL, subject, html });
  } catch (err) {
    // Email non parti : on libère la réservation pour qu'un prochain passage réessaie.
    await prisma.editingRequest.update({ where: { id: requestId }, data: { emailSentAt: null } });
    console.error("[editing-request] email non envoyé:", (err as Error).message);
  }
}
