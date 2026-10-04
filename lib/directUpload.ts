// Côté navigateur : envoi d'un rush directement vers R2 par blocs (cf.
// app/api/episodes/[id]/rushes/direct/route.ts). Retourne `null` quand l'envoi
// direct n'est pas possible (stockage local, CORS du bucket non configuré) :
// l'appelant retombe alors sur l'upload via le serveur.

const PARALLEL_PARTS = 3;
const PART_RETRIES = 3;

class NetworkBlockedError extends Error {}

function putPart(url: string, blob: Blob, onProgress: (loaded: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader("ETag");
        // ETag illisible = CORS du bucket sans "ExposeHeaders: ETag".
        if (!etag) reject(new NetworkBlockedError("ETag illisible"));
        else resolve(etag);
      } else {
        reject(new Error(`Échec de l'envoi d'un bloc (code ${xhr.status}).`));
      }
    };
    xhr.onerror = () => reject(new Error("erreur réseau"));
    xhr.ontimeout = () => reject(new Error("délai dépassé"));
    xhr.send(blob);
  });
}

async function post(url: string, payload: unknown): Promise<Response> {
  return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
}

export async function uploadRushDirect(
  episodeId: string,
  file: File,
  onProgress: (bytesSent: number) => void
): Promise<"done" | null> {
  const base = `/api/episodes/${episodeId}/rushes/direct`;

  const initRes = await post(base, { action: "init", filename: file.name, contentType: file.type || "application/octet-stream" });
  if (!initRes.ok) {
    const data = await initRes.json().catch(() => ({}));
    throw new Error(data.error || `Échec de l'upload (code ${initRes.status}).`);
  }
  const init = await initRes.json();
  if (!init.direct) return null;

  const { key, uploadId, partSize } = init as { key: string; uploadId: string; partSize: number };
  const partCount = Math.max(1, Math.ceil(file.size / partSize));
  const etags: { partNumber: number; etag: string }[] = [];
  const loadedByPart = new Map<number, number>();
  const report = () => onProgress([...loadedByPart.values()].reduce((a, b) => a + b, 0));

  let next = 1;
  const state: { failure: Error | null } = { failure: null };

  async function worker() {
    while (!state.failure) {
      const partNumber = next++;
      if (partNumber > partCount) return;
      const blob = file.slice((partNumber - 1) * partSize, Math.min(file.size, partNumber * partSize));
      let lastError: Error | null = null;
      for (let attempt = 1; attempt <= PART_RETRIES; attempt++) {
        try {
          const urlRes = await post(base, { action: "part-url", key, uploadId, partNumber });
          if (!urlRes.ok) throw new Error(`Échec de l'upload (code ${urlRes.status}).`);
          const { url } = await urlRes.json();
          const etag = await putPart(url, blob, (loaded) => {
            loadedByPart.set(partNumber, loaded);
            report();
          });
          loadedByPart.set(partNumber, blob.size);
          report();
          etags.push({ partNumber, etag });
          lastError = null;
          break;
        } catch (err) {
          lastError = err as Error;
          loadedByPart.set(partNumber, 0);
          if (err instanceof NetworkBlockedError) break;
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
      }
      if (lastError) {
        state.failure = lastError;
        return;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(PARALLEL_PARTS, partCount) }, worker));

  const failure = state.failure;
  if (failure) {
    await post(base, { action: "abort", key, uploadId }).catch(() => {});
    // Aucun bloc envoyé et le navigateur n'a pas pu joindre le bucket (CORS non configuré) :
    // on laisse l'appelant retomber sur l'upload via le serveur.
    const blocked = failure instanceof NetworkBlockedError || failure.message === "erreur réseau";
    if (etags.length === 0 && blocked) return null;
    throw failure;
  }

  const doneRes = await post(base, { action: "complete", key, uploadId, filename: file.name, parts: etags });
  if (!doneRes.ok) {
    const data = await doneRes.json().catch(() => ({}));
    throw new Error(data.error || `Échec de l'upload (code ${doneRes.status}).`);
  }
  return "done";
}
