import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAdmin } from "@/lib/adminApi";
import { sendEpisodeCreditEmail } from "@/lib/email";

const schema = z.object({
  amount: z.number().int().min(1).max(20).default(1),
  reason: z.string().trim().max(300).optional(),
});

// Crédite des épisodes gratuits à un utilisateur (geste commercial, testeur) : s'ajoute à la limite
// de son forfait et reste dans l'historique avec l'admin qui l'a fait.
export const POST = withAdmin<{ params: Promise<{ id: string }> }>(async (req, { params }, admin) => {
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Nombre d'épisodes invalide (1 à 20)." }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true } });
  if (!user) return NextResponse.json({ error: "Utilisateur introuvable." }, { status: 404 });

  const credit = await prisma.episodeCredit.create({
    data: { userId: id, amount: parsed.data.amount, reason: parsed.data.reason || null, createdByEmail: admin.email },
  });

  // Le crédit est déjà accordé : un échec d'envoi ne l'annule pas, il est seulement signalé à l'admin.
  let emailSent = true;
  try {
    await sendEpisodeCreditEmail(user.email);
  } catch {
    emailSent = false;
  }
  return NextResponse.json({ ok: true, id: credit.id, emailSent });
});
