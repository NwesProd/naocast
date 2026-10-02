import { z } from "zod";
import { prisma } from "@/lib/db";
import { TEMPLATE_DEFS, TEMPLATE_KEYS, type TemplateFields, type TemplateKey } from "@/lib/emailTemplates";

// Validation des champs saisis dans le back office.
export const templateFieldsSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  heading: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
  buttonLabel: z.string().trim().min(1).max(60),
  note: z.string().trim().max(500),
});

// Champs effectifs d'un mail automatique : la version modifiée en base si elle
// existe, sinon le texte d'origine. Un échec de lecture ne doit jamais
// empêcher un mail de partir (mot de passe oublié, magic link) : on retombe
// alors sur le texte d'origine.
export async function getTemplateFields(key: TemplateKey): Promise<TemplateFields> {
  try {
    const row = await prisma.emailTemplate.findUnique({ where: { key } });
    if (row) return { subject: row.subject, heading: row.heading, body: row.body, buttonLabel: row.buttonLabel, note: row.note };
  } catch (err) {
    console.error(`[email] lecture du modèle "${key}" impossible, texte d'origine utilisé`, err);
  }
  return TEMPLATE_DEFS[key].defaults;
}

// Pour le back office : tous les modèles, avec l'indication "modifié ou non".
export async function listTemplates(): Promise<Record<TemplateKey, { fields: TemplateFields; customized: boolean }>> {
  const rows = await prisma.emailTemplate.findMany();
  const result = {} as Record<TemplateKey, { fields: TemplateFields; customized: boolean }>;
  for (const key of TEMPLATE_KEYS) {
    const row = rows.find((r) => r.key === key);
    result[key] = row
      ? { fields: { subject: row.subject, heading: row.heading, body: row.body, buttonLabel: row.buttonLabel, note: row.note }, customized: true }
      : { fields: TEMPLATE_DEFS[key].defaults, customized: false };
  }
  return result;
}
