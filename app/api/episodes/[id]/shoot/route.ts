import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonResponse } from "@/lib/json";
import { requireUserId, requireOwnedEpisode } from "@/lib/authz";
import { assertModuleAccess, ModuleLockedError } from "@/lib/entitlements";

// Module « Tournage » : préparation (date, lieu), partie du script en cours, et cycle du jour J
// (départ du chrono, fin, nouveau départ).
async function access(userId: string) {
  try {
    await assertModuleAccess(userId, "tournage");
    return null;
  } catch (err) {
    if (err instanceof ModuleLockedError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }
}

const patchSchema = z.object({
  shootAt: z.string().datetime({ offset: true }).nullable().optional(),
  shootMode: z.enum(["STUDIO", "HOME", "REMOTE"]).nullable().optional(),
  shootPlace: z.string().max(500).nullable().optional(),
  shootPartIndex: z.number().int().min(0).max(200).optional(),
  shootDone: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId } = await params;
  await requireOwnedEpisode(userId, episodeId);
  const locked = await access(userId);
  if (locked) return locked;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const { shootAt, ...rest } = parsed.data;

  const episode = await prisma.episode.update({
    where: { id: episodeId },
    data: { ...rest, ...(shootAt !== undefined ? { shootAt: shootAt ? new Date(shootAt) : null } : {}) },
  });
  return jsonResponse(episode);
}

const actionSchema = z.object({ action: z.enum(["start", "end", "restart"]) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id: episodeId } = await params;
  const episode = await requireOwnedEpisode(userId, episodeId);
  const locked = await access(userId);
  if (locked) return locked;

  const parsed = actionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const running = !!episode.shootStartedAt && !episode.shootEndedAt;

  if (parsed.data.action === "start") {
    // Déjà en cours : on ne remet pas le chrono à zéro (double clic, page rechargée).
    if (running) return jsonResponse(episode);
    const updated = await prisma.episode.update({ where: { id: episodeId }, data: { shootStartedAt: new Date(), shootEndedAt: null, shootPartIndex: 0, shootDone: false } });
    await prisma.shootMarker.deleteMany({ where: { episodeId } });
    return jsonResponse(updated);
  }

  if (parsed.data.action === "end") {
    if (!running) return jsonResponse(episode);
    return jsonResponse(await prisma.episode.update({ where: { id: episodeId }, data: { shootEndedAt: new Date(), shootDone: true } }));
  }

  // restart : nouveau tournage, chrono et repères remis à zéro.
  await prisma.shootMarker.deleteMany({ where: { episodeId } });
  return jsonResponse(await prisma.episode.update({ where: { id: episodeId }, data: { shootStartedAt: new Date(), shootEndedAt: null, shootPartIndex: 0, shootDone: false } }));
}
