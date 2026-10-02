import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/adminApi";
import { appUrl, sendEmail } from "@/lib/email";
import { isTemplateKey, renderTemplate } from "@/lib/emailTemplates";
import { templateFieldsSchema } from "@/lib/emailTemplateStore";

// Envoi de test à l'adresse de l'admin connecté, avec le texte en cours
// d'édition (même non enregistré). Le lien du bouton est un lien d'exemple,
// qui ne connecte ni ne réinitialise rien.
export const POST = withAdmin<{ params: Promise<{ key: string }> }>(async (req, { params }, admin) => {
  const { key } = await params;
  if (!isTemplateKey(key)) return NextResponse.json({ error: "Modèle inconnu." }, { status: 404 });

  const parsed = templateFieldsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Objet, titre, message et libellé du bouton sont requis." }, { status: 400 });

  const rendered = renderTemplate(parsed.data, `${appUrl()}/login`);
  await sendEmail({ to: admin.email, kind: "test", ...rendered, subject: `[Test] ${rendered.subject}` });
  return NextResponse.json({ ok: true, sentTo: admin.email });
});
