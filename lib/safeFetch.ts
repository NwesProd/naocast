import { lookup } from "dns/promises";
import net from "net";

// Téléchargement d'une adresse fournie par l'utilisateur (flux RSS d'un ancien hébergeur, fichiers audio) :
// refuse les adresses internes (réseau privé, localhost, métadonnées cloud) pour ne pas servir de relais vers
// le réseau de naocast, y compris après redirection.

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const v = ip.toLowerCase();
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:127.") || v.startsWith("::ffff:10.") || v.startsWith("::ffff:192.168.");
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Adresse invalide.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("L'adresse doit commencer par http:// ou https://.");
  if (net.isIP(url.hostname)) {
    if (isPrivateIp(url.hostname)) throw new Error("Adresse non autorisée.");
    return url;
  }
  const records = await lookup(url.hostname, { all: true }).catch(() => []);
  if (records.length === 0) throw new Error("Adresse introuvable.");
  if (records.some((r) => isPrivateIp(r.address))) throw new Error("Adresse non autorisée.");
  return url;
}

export async function safeFetch(raw: string, init: RequestInit = {}, maxRedirects = 5): Promise<Response> {
  let current = raw;
  for (let i = 0; i <= maxRedirects; i++) {
    const url = await assertPublicUrl(current);
    const res = await fetch(url, { ...init, redirect: "manual", headers: { "User-Agent": "naocast-import/1.0", ...(init.headers ?? {}) } });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location")!, url).toString();
      continue;
    }
    return res;
  }
  throw new Error("Trop de redirections.");
}
