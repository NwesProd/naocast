import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { deleteObject } from "@/lib/storage";
import { requireUserId } from "@/lib/authz";
import { MEDIA_ASSET_TYPE_KEYS } from "@/lib/mediaAssets";

async function ownedAsset(userId: string, id: string) {
  return prisma.mediaAsset.findFirst({ where: { id, podcast: { userId } } });
}

const patchSchema = z.object({ type: z.enum(MEDIA_ASSET_TYPE_KEYS).optional(), name: z.string().trim().min(1).max(200).optional() });

// Change le type ou le nom d'un média de la bibliothèque.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  if (!(await ownedAsset(userId, id))) return NextResponse.json({ error: "Média introuvable." }, { status: 404 });

  const asset = await prisma.mediaAsset.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ id: asset.id, name: asset.name, type: asset.type });
}

// Supprime un média : la ligne et le fichier du stockage.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id } = await params;
  const asset = await ownedAsset(userId, id);
  if (!asset) return NextResponse.json({ error: "Média introuvable." }, { status: 404 });

  await prisma.mediaAsset.delete({ where: { id } });
  await deleteObject(asset.key).catch(() => {});
  return NextResponse.json({ ok: true });
}
