import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { Prisma } from "@/app/generated/prisma/client";
import { deleteObject, getSignedDownloadUrl, putObject } from "@/lib/storage";
import { parseMultipart } from "@/lib/parseMultipart";
import { requireUserId, AuthError } from "@/lib/authz";
import { BIBLE_DOC_MAX_BYTES, extractDocumentText, isSupportedBibleDocument } from "@/lib/documentText";

export interface BibleDocument {
  key: string;
  filename: string;
  mimeType: string;
  text?: string | null;
}

// Ajoute un document à la bible du podcast (PDF, Word, texte ou Markdown), ou
// remplace un document existant quand `replaceKey` est fourni. Le texte du
// document est extrait à l'envoi pour l'aperçu et le connecteur Claude.
export async function POST(req: Request) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "Votre session a expiré, reconnectez-vous." }, { status: 401 });
    throw err;
  }
  const podcast = await prisma.podcast.findUnique({ where: { userId } });
  if (!podcast) return NextResponse.json({ error: "Enregistrez d'abord le titre du podcast." }, { status: 400 });

  let uploaded: BibleDocument | null = null;
  let tooBig = false;
  const fields = await parseMultipart(req, async (file) => {
    if (file.fieldName !== "file" || !file.filename || uploaded || !isSupportedBibleDocument(file.filename)) {
      file.stream.resume();
      return;
    }
    // Petits fichiers bufferisés en mémoire : R2 refuse un upload sans longueur connue.
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of file.stream) {
      size += (chunk as Buffer).length;
      if (size > BIBLE_DOC_MAX_BYTES) {
        tooBig = true;
        file.stream.resume();
        return;
      }
      chunks.push(chunk as Buffer);
    }
    const buffer = Buffer.concat(chunks);
    const key = `podcast/reference/${randomUUID()}-${file.filename}`;
    await putObject(key, buffer, file.mimeType);
    uploaded = { key, filename: file.filename, mimeType: file.mimeType, text: await extractDocumentText(buffer, file.filename) };
  });

  if (tooBig) return NextResponse.json({ error: "Document trop lourd (15 Mo maximum)." }, { status: 400 });
  if (!uploaded) return NextResponse.json({ error: "Format non pris en charge : utilisez un PDF, un .docx, un .txt ou un .md." }, { status: 400 });
  const doc: BibleDocument = uploaded;

  const files = (podcast.referenceFiles as BibleDocument[] | null) ?? [];
  const replaceIndex = fields.replaceKey ? files.findIndex((f) => f.key === fields.replaceKey) : -1;
  const next = [...files];
  if (replaceIndex !== -1) {
    await deleteObject(files[replaceIndex].key).catch(() => {});
    next[replaceIndex] = doc;
  } else {
    next.push(doc);
  }
  await prisma.podcast.update({ where: { userId }, data: { referenceFiles: next as unknown as Prisma.InputJsonValue } });

  return NextResponse.json({ file: { ...doc, url: await getSignedDownloadUrl(doc.key) } });
}
