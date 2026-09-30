import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/authz";
import { jsonResponse } from "@/lib/json";

// Module "Paramètres" (compte) : changer l'email, distinct du mot de passe
// (cf. PATCH ci-dessous) qui exige lui le mot de passe actuel.
const emailSchema = z.object({ email: z.string().email() });

export async function PATCH(req: Request) {
  const userId = await requireUserId();
  const parsed = emailSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Email invalide." }, { status: 400 });

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing && existing.id !== userId) {
    return NextResponse.json({ error: "Un compte existe déjà avec cet email." }, { status: 409 });
  }

  const user = await prisma.user.update({ where: { id: userId }, data: { email: parsed.data.email } });
  return jsonResponse({ email: user.email });
}
