import { getObjectBuffer } from "@/lib/storage";

// Sert une pochette du flux directement (et non par redirection vers un lien de stockage signé) : les
// validateurs et certaines applications vérifient l'image avec une requête HEAD ou n'acceptent pas la redirection.
export async function serveImage(key: string): Promise<Response> {
  const ext = key.split(".").pop()?.toLowerCase();
  const type = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  const body = await getObjectBuffer(key);
  return new Response(new Uint8Array(body), {
    headers: { "Content-Type": type, "Content-Length": String(body.length), "Cache-Control": "public, max-age=3600" },
  });
}
