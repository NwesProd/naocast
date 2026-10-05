import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/authz";
import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/editingRequest";

// Module "Feedback" (en bas à droite de l'app) : enregistre le retour de l'utilisateur,
// consultable dans l'onglet Support du back office, et prévient l'équipe par email.
const FEEDBACK_EMAIL = process.env.FEEDBACK_EMAIL || "contact@naocast.com";
const KIND_LABEL = { BUG: "Bug", IDEA: "Idée", OTHER: "Autre" } as const;

const bodySchema = z.object({
  kind: z.enum(["BUG", "IDEA", "OTHER"]),
  message: z.string().trim().min(3).max(2000),
  pageUrl: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  const userId = await requireUserId();
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Écris quelques mots pour nous aider." }, { status: 400 });

  // Garde-fou : pas plus de 10 retours par heure et par compte.
  const recent = await prisma.feedback.count({ where: { userId, createdAt: { gte: new Date(Date.now() - 3600_000) } } });
  if (recent >= 10) return NextResponse.json({ error: "Trop de messages d'affilée, réessaie dans un moment." }, { status: 429 });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
  const feedback = await prisma.feedback.create({
    data: { userId, userEmail: user.email, kind: parsed.data.kind, message: parsed.data.message, pageUrl: parsed.data.pageUrl || null },
  });

  // L'email est un plus : son échec ne doit pas faire perdre le retour (déjà enregistré).
  try {
    await sendEmail({
      to: FEEDBACK_EMAIL,
      subject: `Feedback naocast (${KIND_LABEL[feedback.kind]}) : ${user.email}`,
      html: `<p><strong>${KIND_LABEL[feedback.kind]}</strong> de ${escapeHtml(user.email)}</p>
        <p style="white-space:pre-wrap">${escapeHtml(feedback.message)}</p>
        ${feedback.pageUrl ? `<p>Page : ${escapeHtml(feedback.pageUrl)}</p>` : ""}`,
    });
  } catch (err) {
    console.warn("[feedback] email non envoyé:", (err as Error).message);
  }

  return NextResponse.json({ ok: true });
}
