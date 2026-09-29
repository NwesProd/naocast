import Busboy from "busboy";
import { Readable } from "stream";

// `request.formData()` (utilisé par défaut dans les Route Handlers Next.js)
// bufferise l'intégralité du corps de la requête en mémoire avant de rendre
// le moindre champ accessible, inacceptable pour des rushs vidéo qui
// peuvent peser plusieurs centaines de Mo (uploads très lents, pic mémoire).
// On parse le multipart en streaming avec busboy à la place : chaque fichier
// est traité au fil de l'eau via `onFile`, sans jamais être entièrement
// chargé en RAM côté serveur.

export interface ParsedFilePart {
  fieldName: string;
  filename: string;
  mimeType: string;
  stream: Readable;
}

export async function parseMultipart(
  req: Request,
  onFile: (file: ParsedFilePart) => Promise<void>
): Promise<Record<string, string>> {
  const contentType = req.headers.get("content-type") || "";
  const fields: Record<string, string> = {};

  if (!req.body) return fields;

  const filePromises: Promise<void>[] = [];

  await new Promise<void>((resolve, reject) => {
    const bb = Busboy({ headers: { "content-type": contentType } });

    bb.on("field", (name, value) => {
      fields[name] = value;
    });

    bb.on("file", (name, stream, info) => {
      filePromises.push(
        onFile({ fieldName: name, filename: info.filename, mimeType: info.mimeType, stream }).catch((err) => {
          stream.resume(); // vide le flux pour ne pas bloquer busboy en cas d'erreur applicative
          throw err;
        })
      );
    });

    bb.on("error", reject);
    bb.on("close", () => {
      Promise.all(filePromises).then(() => resolve(), reject);
    });

    Readable.fromWeb(req.body as import("stream/web").ReadableStream).pipe(bb);
  });

  return fields;
}
