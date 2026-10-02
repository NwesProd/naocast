import { createHmac, timingSafeEqual } from "crypto";
import { newsEmail, renderTemplate, type EmailKind } from "@/lib/emailTemplates";
import { logEmails } from "@/lib/emailLog";
import { getTemplateFields } from "@/lib/emailTemplateStore";

// Envoi d'emails via Resend (https://resend.com). Sans RESEND_API_KEY (dev),
// le message est simplement loggé côté serveur : tout reste testable de bout
// en bout sans compte email.
//
// Variables d'environnement :
// - RESEND_API_KEY : clé API Resend
// - EMAIL_FROM : expéditeur, sur un domaine vérifié dans Resend
//   (ex. "naocast. <bonjour@naocast.com>")
// - EMAIL_REPLY_TO (optionnel) : adresse qui reçoit les réponses des utilisateurs

const RESEND_API = "https://api.resend.com";

// URL publique de l'app, pour les liens envoyés par email. NEXTAUTH_URL plutôt
// que l'URL de la requête entrante : derrière le proxy d'un hébergeur, celle-ci
// peut être l'adresse interne du conteneur et non le domaine public.
export function appUrl(): string {
  return (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
  headers?: Record<string, string>;
  // Nature du mail, pour le journal d'emails (jamais envoyée à Resend).
  kind?: EmailKind;
}

function fromAddress(): string {
  return process.env.EMAIL_FROM || "naocast. <onboarding@resend.dev>";
}

function toResendPayload(msg: EmailMessage) {
  return {
    from: fromAddress(),
    to: msg.to,
    subject: msg.subject,
    html: msg.html,
    ...(msg.text ? { text: msg.text } : {}),
    ...(process.env.EMAIL_REPLY_TO ? { reply_to: process.env.EMAIL_REPLY_TO } : {}),
    ...(msg.headers ? { headers: msg.headers } : {}),
  };
}

export async function sendEmail(msg: EmailMessage): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[email] (dev, aucun RESEND_API_KEY) à ${msg.to} : ${msg.subject}\n${msg.text || msg.html}`);
    await logEmails([{ msg, status: "SIMULATED" }]);
    return;
  }

  let res: Response;
  try {
    res = await fetch(`${RESEND_API}/emails`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(toResendPayload(msg)),
    });
  } catch (err) {
    await logEmails([{ msg, status: "FAILED", error: (err as Error).message }]);
    throw err;
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    await logEmails([{ msg, status: "FAILED", error: `HTTP ${res.status} ${body}` }]);
    throw new Error(`Échec de l'envoi de l'email (Resend, HTTP ${res.status}) : ${body}`);
  }
  const data = (await res.json().catch(() => null)) as { id?: string } | null;
  await logEmails([{ msg, status: "SENT", providerId: data?.id }]);
}

// Envoi groupé (news) : l'API batch de Resend accepte 100 messages par appel,
// et limite le débit par défaut à 2 requêtes par seconde, d'où la pause entre
// deux lots. Renvoie le nombre de messages acceptés.
export async function sendEmailBatch(messages: EmailMessage[]): Promise<number> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[email] (dev, aucun RESEND_API_KEY) envoi groupé simulé : ${messages.length} message(s)`);
    await logEmails(messages.map((msg) => ({ msg, status: "SIMULATED" as const })));
    return messages.length;
  }

  let sent = 0;
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    let res: Response;
    try {
      res = await fetch(`${RESEND_API}/emails/batch`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(chunk.map(toResendPayload)),
      });
    } catch (err) {
      await logEmails(chunk.map((msg) => ({ msg, status: "FAILED" as const, error: (err as Error).message })));
      throw err;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      await logEmails(chunk.map((msg) => ({ msg, status: "FAILED" as const, error: `HTTP ${res.status} ${body}` })));
      throw new Error(`Échec de l'envoi groupé (Resend, HTTP ${res.status}) après ${sent} message(s) : ${body}`);
    }
    const data = (await res.json().catch(() => null)) as { data?: { id?: string }[] } | null;
    await logEmails(chunk.map((msg, idx) => ({ msg, status: "SENT" as const, providerId: data?.data?.[idx]?.id })));
    sent += chunk.length;
    if (i + 100 < messages.length) await new Promise((r) => setTimeout(r, 600));
  }
  return sent;
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  await sendEmail({ to, kind: "password_reset", ...renderTemplate(await getTemplateFields("password_reset"), resetUrl) });
}

export async function sendWelcomeEmail(to: string): Promise<void> {
  await sendEmail({ to, kind: "welcome", ...renderTemplate(await getTemplateFields("welcome"), `${appUrl()}/podcast`) });
}

export async function sendMagicLinkEmail(to: string, loginUrl: string): Promise<void> {
  await sendEmail({ to, kind: "magic_link", ...renderTemplate(await getTemplateFields("magic_link"), loginUrl) });
}

// Jeton de désinscription : HMAC de l'id utilisateur avec le secret de
// l'app, vérifiable sans stockage ni table dédiée, impossible à forger pour
// désinscrire quelqu'un d'autre.
function unsubscribeSecret(): string {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "dev-unsubscribe-secret";
}

export function unsubscribeToken(userId: string): string {
  return createHmac("sha256", unsubscribeSecret()).update(`unsubscribe:${userId}`).digest("hex");
}

export function verifyUnsubscribeToken(userId: string, token: string): boolean {
  const expected = Buffer.from(unsubscribeToken(userId));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function unsubscribeUrl(userId: string): string {
  return `${appUrl()}/unsubscribe?u=${encodeURIComponent(userId)}&t=${unsubscribeToken(userId)}`;
}

// Message d'information (news, nouveautés) pour un utilisateur donné, avec
// lien de désinscription dans le pied de page ET en-tête List-Unsubscribe
// (désinscription en un clic proposée par les clients mail).
export function buildNewsMessage(user: { id: string; email: string }, subject: string, body: string): EmailMessage {
  const unsub = unsubscribeUrl(user.id);
  return {
    to: user.email,
    kind: "news",
    ...newsEmail(subject, body, unsub),
    headers: { "List-Unsubscribe": `<${unsub}>` },
  };
}

// Étape "1. Monteur" → "J'ai déjà un monteur" → "Je lui envoie les rushs et
// lui donne des indications" : après le tunnel (import, découpes,
// génériques...), un email récapitulatif est envoyé au monteur personnel de
// l'utilisateur, aucun tarif naocast. impliqué, contrairement à NEED_EDITOR.
export async function sendEpisodeToOwnEditor(to: string, subject: string, htmlBody: string): Promise<void> {
  await sendEmail({ to, subject, html: htmlBody });
}
