import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyUnsubscribeToken } from "@/lib/email";

const schema = z.object({ userId: z.string().min(1), token: z.string().min(1) });

// Désinscription des mails d'information, sans connexion requise (lien dans
// le pied de page des mails). Le jeton est un HMAC de l'id utilisateur, cf.
// lib/email.ts : impossible de désinscrire quelqu'un d'autre sans le secret.
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !verifyUnsubscribeToken(parsed.data.userId, parsed.data.token)) {
    return NextResponse.json({ error: "Lien de désinscription invalide." }, { status: 400 });
  }
  await prisma.user.updateMany({ where: { id: parsed.data.userId }, data: { marketingOptOut: true } });
  return NextResponse.json({ ok: true });
}
