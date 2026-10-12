import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { deleteObject } from "@/lib/storage";
import { requireUserId } from "@/lib/authz";

// Suppression d'un média du podcast (onglet Graphisme) : pochette, logo, générique de début
// ou de fin. Le fichier (et l'aperçu d'un générique) est aussi retiré du stockage.
const FIELDS = {
  cover: { key: "coverKey", preview: null },
  logo: { key: "logoKey", preview: null },
  intro: { key: "introKey", preview: "introPreviewKey" },
  outro: { key: "outroKey", preview: "outroPreviewKey" },
} as const;

const bodySchema = z.object({ field: z.enum(["cover", "logo", "intro", "outro"]) });

export async function DELETE(req: Request) {
  const userId = await requireUserId();
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Média inconnu." }, { status: 400 });

  const podcast = await prisma.podcast.findUnique({ where: { userId } });
  if (!podcast) return NextResponse.json({ error: "Podcast introuvable." }, { status: 404 });

  const { key, preview } = FIELDS[parsed.data.field];
  const keys = [podcast[key], preview ? podcast[preview] : null].filter((k): k is string => !!k);

  await prisma.podcast.update({
    where: { id: podcast.id },
    data: { [key]: null, ...(preview ? { [preview]: null } : {}) },
  });
  await Promise.all(keys.map((k) => deleteObject(k).catch(() => {})));

  return NextResponse.json({ ok: true });
}
