import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/authz";

// Exige le mot de passe actuel (contrairement à /api/reset-password, qui
// passe par un token email pour l'utilisateur qui l'a justement oublié) :
// ici l'utilisateur est déjà connecté et le change de son plein gré.
const schema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) });

export async function PATCH(req: Request) {
  const userId = await requireUserId();
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!valid) return NextResponse.json({ error: "Mot de passe actuel incorrect." }, { status: 400 });

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

  return NextResponse.json({ ok: true });
}
