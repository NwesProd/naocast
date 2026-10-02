import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdmin } from "@/lib/adminApi";
import { buildNewsMessage, sendEmail } from "@/lib/email";

const schema = z.object({ subject: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(20000) });

// Envoi de test : uniquement à l'adresse de l'admin connecté, pour relire le
// rendu réel (gabarit, pied de page, lien de désinscription) avant l'envoi.
export const POST = withAdmin(async (req, _ctx, admin) => {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Objet et message sont requis." }, { status: 400 });

  await sendEmail({ ...buildNewsMessage(admin, parsed.data.subject, parsed.data.body), kind: "test" });
  return NextResponse.json({ ok: true, sentTo: admin.email });
});
