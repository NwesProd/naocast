import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { sendWelcomeEmail } from "@/lib/email";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  profileType: z.enum(["PODCASTEUR", "MONTEUR", "AGENCE", "AUTRE"]),
});

// Étape 1 du parcours utilisateur : inscription.
export async function POST(req: Request) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Formulaire invalide." }, { status: 400 });
  }
  const { email, password, profileType } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "Un compte existe déjà avec cet email." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({ data: { email, passwordHash, profileType } });

  // Mail de bienvenue : jamais bloquant, un souci d'envoi ne doit pas faire
  // échouer une inscription par ailleurs réussie.
  sendWelcomeEmail(user.email).catch((err) => console.error("[signup] échec du mail de bienvenue:", err));

  return NextResponse.json({ id: user.id, email: user.email });
}
