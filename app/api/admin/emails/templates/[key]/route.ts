import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAdmin } from "@/lib/adminApi";
import { isTemplateKey } from "@/lib/emailTemplates";
import { templateFieldsSchema } from "@/lib/emailTemplateStore";

type Ctx = { params: Promise<{ key: string }> };

// Enregistre une version modifiée d'un mail automatique.
export const PUT = withAdmin<Ctx>(async (req, { params }) => {
  const { key } = await params;
  if (!isTemplateKey(key)) return NextResponse.json({ error: "Modèle inconnu." }, { status: 404 });

  const parsed = templateFieldsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Objet, titre, message et libellé du bouton sont requis." }, { status: 400 });
  }

  await prisma.emailTemplate.upsert({ where: { key }, create: { key, ...parsed.data }, update: parsed.data });
  return NextResponse.json({ ok: true });
});

// Rétablit le texte d'origine (supprime la version modifiée).
export const DELETE = withAdmin<Ctx>(async (_req, { params }) => {
  const { key } = await params;
  if (!isTemplateKey(key)) return NextResponse.json({ error: "Modèle inconnu." }, { status: 404 });

  await prisma.emailTemplate.deleteMany({ where: { key } });
  return NextResponse.json({ ok: true });
});
