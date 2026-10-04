import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId, requireOwnedEpisode, AuthError } from "@/lib/authz";
import { jsonResponse } from "@/lib/json";
import { getFullEpisode } from "@/lib/episode";
import { deleteEpisodeStorage } from "@/lib/pipeline/cleanup";
import { getUserPlan } from "@/lib/entitlements";
import { PLAN_LOCKS_VALIDATED_EPISODE_DELETION } from "@/lib/plan";
import { z } from "zod";

// requireUserId/requireOwnedEpisode lèvent au lieu de répondre directement
// (cf. lib/authz.ts), sans ce mapping en erreur JSON, une session expirée ou
// un épisode inaccessible plantait la requête sans corps de réponse
// exploitable côté client (crash "Unexpected end of JSON input" au lieu d'un
// message clair, constaté en conditions réelles sur refreshEpisode).
function errorResponse(err: unknown): NextResponse {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: "Votre session a expiré, reconnectez-vous." }, { status: 401 });
  }
  return NextResponse.json({ error: "Épisode introuvable." }, { status: 404 });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let userId: string;
  try {
    userId = await requireUserId();
    await requireOwnedEpisode(userId, id);
  } catch (err) {
    return errorResponse(err);
  }

  const episode = await getFullEpisode(id);
  return jsonResponse(episode);
}

// Étape 0 du formulaire : informations de base (titre obligatoire, le reste
// optionnel). Étapes 3-4 : type de tournage (pré-monté / caméras séparées) et autocut.
const patchSchema = z.object({
  title: z.string().optional(),
  season: z.number().int().positive().optional(),
  episodeNumber: z.number().int().positive().optional(),
  releaseDate: z.coerce.date().optional(),
  cameraSetup: z.enum(["PRE_EDITED", "MULTI_CAMERA"]).optional(),
  autocutEnabled: z.boolean().optional(),
  autocutSilenceMs: z.number().int().positive().optional(),
  logoEnabled: z.boolean().optional(),
  logoOnIntro: z.boolean().optional(),
  logoOnOutro: z.boolean().optional(),
  logoPosition: z.enum(["TOP_LEFT", "TOP_RIGHT", "BOTTOM_LEFT", "BOTTOM_RIGHT"]).optional(),
  introTeaserChoice: z.enum(["NONE", "MODULE", "IMPORT"]).optional(),
  editorChoice: z.enum(["PODKO", "NEED_EDITOR", "HAS_EDITOR_SEND", "HAS_EDITOR_IMPORT"]).optional(),
  introSource: z.enum(["PODCAST", "EPISODE"]).optional(),
  outroSource: z.enum(["PODCAST", "EPISODE"]).optional(),
  introCreationMode: z.enum(["IMPORT", "CUSTOM"]).optional(),
  introCustomMode: z.enum(["TEASER_COMPILATION", "OWN_IDEA"]).optional(),
  introCustomDescription: z.string().optional(),
  introEditorNotes: z.string().max(5000).nullable().optional(),
  outroCreationMode: z.enum(["IMPORT", "CUSTOM"]).optional(),
  outroCustomMode: z.enum(["TEASER_COMPILATION", "OWN_IDEA"]).optional(),
  outroCustomDescription: z.string().optional(),
  guestsCastingValidated: z.boolean().optional(),
  scriptDraft: z.string().optional(),
  scriptValidated: z.boolean().optional(),
  introValidatedExternally: z.boolean().optional(),
  montageValidatedExternally: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let userId: string;
  try {
    userId = await requireUserId();
    await requireOwnedEpisode(userId, id);
  } catch (err) {
    return errorResponse(err);
  }

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Formulaire invalide." }, { status: 400 });

  const episode = await prisma.episode.update({ where: { id }, data: parsed.data });
  return jsonResponse(episode);
}

// Suppression depuis la liste "Épisodes" (icône poubelle + popup de
// validation côté client), cascade en base sur rushs, transcript, découpes,
// jobs et exports (cf. prisma/schema.prisma).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let userId: string;
  let episode;
  try {
    userId = await requireUserId();
    episode = await requireOwnedEpisode(userId, id);
  } catch (err) {
    return errorResponse(err);
  }

  // Free et basic : un épisode exporté ne peut plus être supprimé (cf.
  // PLAN_LOCKS_VALIDATED_EPISODE_DELETION), ce qui permettrait de contourner
  // le quota en recommençant avec un nouvel épisode "vierge". Infinity et
  // lifetime, sans limite d'épisodes, peuvent le supprimer.
  const plan = await getUserPlan(userId);
  if (episode.status === "EXPORTED" && PLAN_LOCKS_VALIDATED_EPISODE_DELETION[plan]) {
    return NextResponse.json({ error: "Cet épisode a été validé et ne peut plus être supprimé." }, { status: 403 });
  }

  // Avant la cascade Prisma (qui efface les lignes mais jamais les fichiers
  // qu'elles référencent) : supprime les objets R2/B2 propres à cet épisode,
  // sans quoi ils resteraient orphelins (et facturés) indéfiniment.
  await deleteEpisodeStorage(id);
  await prisma.episode.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
