import { NextResponse } from "next/server";
import { createReadStream, existsSync, statSync } from "fs";
import { Readable } from "stream";
import path from "path";
import { getLocalPath } from "@/lib/storage";
import { requireUserId } from "@/lib/authz";

// Sert les fichiers du stockage local (.data/storage) en dev, quand aucun
// bucket S3 (R2/B2) n'est configuré. En production avec un bucket réel,
// getSignedDownloadUrl() renvoie directement une URL signée et cette route
// n'est pas utilisée.
//
// Exclue du middleware (cf. proxy.ts) car les <video>/<a download> ne
// peuvent pas porter les cookies de session vers une redirection /login, on
// vérifie donc l'authentification ici directement. Ne vérifie pas la
// propriété exacte de la clé (acceptable pour ce fallback de dev local, pas
// pour la prod où R2/B2 prend le relais via URL signée).
//
// Streamé (jamais chargé entièrement en mémoire) avec support des Range
// requests : nécessaire pour que <video>/<audio> puissent lire et chercher
// dans un fichier volumineux (générique, rendu final) sans tout télécharger.

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
};

function guessContentType(filePath: string): string {
  return MIME_BY_EXT[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

export async function GET(req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  try {
    await requireUserId();
  } catch {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { key } = await params;
  const filePath = getLocalPath(key.join("/"));
  if (!existsSync(filePath)) {
    return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
  }

  const { size } = statSync(filePath);
  const contentType = guessContentType(filePath);
  const range = req.headers.get("range");

  // storageKey est un chemin FIXE pour un rendu vidéo (episodes/{id}/final.mp4,
  // réécrit à chaque rendu plutôt que versionné) : sans en-tête explicite, le
  // navigateur peut mettre en cache le contenu par heuristique et réafficher
  // une ancienne version après un nouveau rendu, malgré le paramètre `?v=`
  // anti-cache déjà ajouté à l'URL (cf. review/page.tsx), constaté en
  // conditions réelles après "Relancer le rendu".
  const noStore = { "Cache-Control": "no-store" };

  if (range) {
    const match = /bytes=(\d+)-(\d*)/.exec(range);
    const start = match ? parseInt(match[1], 10) : 0;
    const end = match?.[2] ? parseInt(match[2], 10) : size - 1;

    return new NextResponse(Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream, {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(end - start + 1),
        "Content-Type": contentType,
        ...noStore,
      },
    });
  }

  return new NextResponse(Readable.toWeb(createReadStream(filePath)) as ReadableStream, {
    headers: {
      "Content-Length": String(size),
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      ...noStore,
    },
  });
}
