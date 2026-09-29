import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@/app/generated/prisma/client";
import { putObjectStream } from "@/lib/storage";
import { parseMultipart } from "@/lib/parseMultipart";
import { requireUserId, AuthError } from "@/lib/authz";
import { jsonResponse } from "@/lib/json";
import { randomUUID } from "crypto";

interface ReferenceFile {
  key: string;
  filename: string;
  mimeType: string;
}

// Onglet "ADN" (Mon podcast) : titre + positionnement en texte libre +
// documents de référence (bible existante, notes...), tout ce qui nourrit
// ensuite la génération de la bible (cf. POST /api/podcast/bible). Route
// distincte de POST /api/podcast (onglet "Graphisme") : les deux onglets
// s'enregistrent indépendamment plutôt que de partager un seul gros formulaire.
export async function POST(req: Request) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: "Votre session a expiré, reconnectez-vous." }, { status: 401 });
    }
    throw err;
  }

  const existing = await prisma.podcast.findUnique({ where: { userId } });
  const newFiles: ReferenceFile[] = [];

  const fields = await parseMultipart(req, async (file) => {
    if (!file.filename) {
      file.stream.resume();
      return;
    }
    if (file.fieldName !== "referenceFiles") {
      file.stream.resume();
      return;
    }
    const key = `podcast/reference/${randomUUID()}-${file.filename}`;
    await putObjectStream(key, file.stream, file.mimeType);
    newFiles.push({ key, filename: file.filename, mimeType: file.mimeType });
  });

  const title = (fields.title || "").trim();
  if (!title) return NextResponse.json({ error: "Le titre est requis." }, { status: 400 });

  const existingFiles = (existing?.referenceFiles as ReferenceFile[] | null) ?? [];
  const referenceFiles = [...existingFiles, ...newFiles];

  const podcast = await prisma.podcast.upsert({
    where: { userId },
    update: {
      title,
      dna: fields.dna !== undefined ? fields.dna || null : undefined,
      referenceFiles: referenceFiles as unknown as Prisma.InputJsonValue,
    },
    create: {
      userId,
      title,
      dna: fields.dna || null,
      referenceFiles: referenceFiles as unknown as Prisma.InputJsonValue,
    },
  });

  return jsonResponse(podcast);
}
