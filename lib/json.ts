import { NextResponse } from "next/server";

// RushSource.fileSizeBytes est un BigInt (Prisma), JSON.stringify plante
// dessus par défaut (`Do not know how to serialize a BigInt`). Number() est
// sûr ici : aucun fichier de rush ne s'approchera de Number.MAX_SAFE_INTEGER.
export function jsonResponse(data: unknown, init?: ResponseInit): NextResponse {
  const body = JSON.stringify(data, (_key, value) => (typeof value === "bigint" ? Number(value) : value));
  return new NextResponse(body, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
}
