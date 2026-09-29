import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@/app/generated/prisma/client";
import { deleteObject } from "@/lib/storage";
import { requireUserId } from "@/lib/authz";
import { jsonResponse } from "@/lib/json";
import { z } from "zod";

interface ReferenceFile {
  key: string;
  filename: string;
  mimeType: string;
}

const bodySchema = z.object({ key: z.string().min(1) });

// Retire un document de référence de l'onglet "ADN", n'affecte pas la bible
// déjà générée (texte figé une fois écrit, cf. Podcast.bible), seulement les
// documents disponibles pour une prochaine (ré)génération.
export async function DELETE(req: Request) {
  const userId = await requireUserId();
  const podcast = await prisma.podcast.findUnique({ where: { userId } });
  if (!podcast) return NextResponse.json({ error: "Podcast introuvable." }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const { key } = parsed.data;

  const files = (podcast.referenceFiles as ReferenceFile[] | null) ?? [];
  const remaining = files.filter((f) => f.key !== key);
  if (remaining.length === files.length) {
    return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
  }

  await deleteObject(key).catch(() => {
    // best-effort : la ligne en base ne doit pas rester bloquée par un
    // fichier déjà absent du stockage.
  });

  const updated = await prisma.podcast.update({
    where: { userId },
    data: { referenceFiles: remaining as unknown as Prisma.InputJsonValue },
  });

  return jsonResponse(updated);
}
