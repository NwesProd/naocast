import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAdmin } from "@/lib/adminApi";
import { createMagicLoginLink } from "@/lib/authTokens";
import { sendMagicLinkEmail } from "@/lib/email";

// Le magic link part uniquement vers l'email du compte (jamais affiché ni
// renvoyé à l'admin) : le back office permet d'aider un utilisateur à se
// connecter, pas de se connecter à sa place.
export const POST = withAdmin<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true } });
  if (!user) return NextResponse.json({ error: "Utilisateur introuvable." }, { status: 404 });

  await sendMagicLinkEmail(user.email, await createMagicLoginLink(user.id));
  return NextResponse.json({ ok: true, sentTo: user.email });
});
