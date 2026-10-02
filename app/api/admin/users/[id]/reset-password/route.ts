import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAdmin } from "@/lib/adminApi";
import { createPasswordResetLink } from "@/lib/authTokens";
import { sendPasswordResetEmail } from "@/lib/email";

// Envoie à l'utilisateur lui-même (sur son email de compte) un lien de
// réinitialisation : le lien n'est jamais affiché dans le back office.
export const POST = withAdmin<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true } });
  if (!user) return NextResponse.json({ error: "Utilisateur introuvable." }, { status: 404 });

  await sendPasswordResetEmail(user.email, await createPasswordResetLink(user.id));
  return NextResponse.json({ ok: true, sentTo: user.email });
});
