import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId, requireOwnedEpisode, AuthError } from "@/lib/authz";
import { jsonResponse } from "@/lib/json";
import { getFullEpisode } from "@/lib/episode";
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
  outroCreationMode: z.enum(["IMPORT", "CUSTOM"]).optional(),
  outroCustomMode: z.enum(["TEASER_COMPILATION", "OWN_IDEA"]).optional(),
  outroCustomDescription: z.string().optional(),
  guestsCastingValidated: z.boolean().optional(),
  scriptDraft: z.string().optional(),
  scriptValidated: z.boolean().optional(),
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
  try {
    userId = await requireUserId();
    await requireOwnedEpisode(userId, id);
  } catch (err) {
    return errorResponse(err);
  }

  await prisma.episode.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
