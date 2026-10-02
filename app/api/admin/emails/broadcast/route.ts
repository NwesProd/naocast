import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAdmin } from "@/lib/adminApi";
import { buildNewsMessage, sendEmailBatch } from "@/lib/email";
import type { Prisma } from "@/app/generated/prisma/client";

const schema = z.object({
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20000),
  segment: z.enum(["ALL", "PAID", "FREE", "BASIC", "INFINITY", "LIFETIME"]),
  // dryRun : ne fait que compter les destinataires (étape de confirmation
  // côté interface avant l'envoi réel).
  dryRun: z.boolean(),
});

function segmentFilter(segment: z.infer<typeof schema>["segment"]): Prisma.UserWhereInput {
  if (segment === "ALL") return {};
  if (segment === "PAID") return { plan: { in: ["BASIC", "INFINITY", "LIFETIME"] } };
  return { plan: segment };
}

// Mail d'information à un segment d'utilisateurs. Les désinscrits
// (marketingOptOut) sont toujours exclus, et chaque message porte son lien de
// désinscription personnel. Les mails de compte (mot de passe, connexion) ne
// passent jamais par ici.
export const POST = withAdmin(async (req) => {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Objet, message et segment sont requis." }, { status: 400 });
  const { subject, body, segment, dryRun } = parsed.data;

  const recipients = await prisma.user.findMany({
    where: { ...segmentFilter(segment), marketingOptOut: false },
    select: { id: true, email: true },
  });

  if (dryRun) return NextResponse.json({ ok: true, count: recipients.length });
  if (recipients.length === 0) return NextResponse.json({ error: "Aucun destinataire pour ce segment." }, { status: 400 });

  const sent = await sendEmailBatch(recipients.map((u) => buildNewsMessage(u, subject, body)));
  return NextResponse.json({ ok: true, count: sent });
});
