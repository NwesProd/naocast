import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAdmin } from "@/lib/adminApi";
import { sendWelcomeEmail } from "@/lib/email";

export const POST = withAdmin<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id }, select: { email: true } });
  if (!user) return NextResponse.json({ error: "Utilisateur introuvable." }, { status: 404 });

  await sendWelcomeEmail(user.email);
  return NextResponse.json({ ok: true, sentTo: user.email });
});
