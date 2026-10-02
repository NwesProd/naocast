// Gabarits des emails envoyés par naocast. Chaque fonction renvoie
// { subject, html, text } : le texte brut sert de repli aux clients mail qui
// n'affichent pas le HTML (et améliore la délivrabilité).

const BRAND_COLOR = "#E85A2A";
const INK = "#282828";
const MUTED = "#6B6B6B";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${href}" style="background:${BRAND_COLOR};color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px;display:inline-block">${escapeHtml(label)}</a></p>`;
}

function layout(bodyHtml: string, footerHtml = ""): string {
  return `<!doctype html>
<html lang="fr"><body style="margin:0;padding:0;background:#f6f4f1">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f4f1;padding:32px 16px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;padding:32px;font-family:Arial,Helvetica,sans-serif;color:${INK};font-size:15px;line-height:1.6">
<tr><td>
<p style="margin:0 0 24px;font-size:20px;font-weight:700;letter-spacing:-0.02em">naocast.</p>
${bodyHtml}
<p style="margin:32px 0 0;color:${MUTED};font-size:13px">L'équipe naocast.</p>
</td></tr>
</table>
${footerHtml ? `<p style="max-width:560px;color:${MUTED};font-size:12px;font-family:Arial,Helvetica,sans-serif;margin:16px 0 0">${footerHtml}</p>` : ""}
</td></tr>
</table>
</body></html>`;
}

// Mails automatiques dont le texte est modifiable depuis le back office
// (onglet Emails). Les valeurs d'origine sont ici ; une version modifiée est
// stockée en base (EmailTemplate) et remplace ces valeurs champ par champ.
// Le lien du bouton reste, lui, toujours généré par l'app (jeton propre à
// chaque envoi) : seul son libellé se modifie.
export type TemplateKey = "welcome" | "password_reset" | "magic_link";

export interface TemplateFields {
  subject: string;
  heading: string;
  // Texte simple : une ligne vide sépare deux paragraphes.
  body: string;
  buttonLabel: string;
  // Petite mention sous le bouton (peut être vide).
  note: string;
}

// Nature d'un mail envoyé, pour le journal d'emails du back office.
export type EmailKind = TemplateKey | "news" | "test" | "other";

export const TEMPLATE_KEYS: TemplateKey[] = ["welcome", "password_reset", "magic_link"];

export const TEMPLATE_DEFS: Record<TemplateKey, { label: string; trigger: string; linkHelp: string; defaults: TemplateFields }> = {
  welcome: {
    label: "Bienvenue",
    trigger: "À l'inscription (renvoyable depuis la fiche utilisateur)",
    linkHelp: "Le bouton ouvre la page de configuration du podcast.",
    defaults: {
      subject: "Bienvenue sur naocast.",
      heading: "Bienvenue sur naocast.",
      body: "Votre compte est prêt. Pour monter votre premier épisode, trois étapes :\n\n1. Configurez votre podcast : titre, pochette, génériques et logo.\n2. Créez un épisode et importez vos rushs.\n3. Laissez naocast. monter, puis validez le résultat en relecture.",
      buttonLabel: "Configurer mon podcast",
      note: "Une question ? Répondez simplement à cet email.",
    },
  },
  password_reset: {
    label: "Mot de passe oublié",
    trigger: "Demande de l'utilisateur, ou envoi depuis la fiche utilisateur",
    linkHelp: "Le bouton ouvre un lien de réinitialisation personnel, valable une heure.",
    defaults: {
      subject: "Réinitialisation de votre mot de passe naocast.",
      heading: "Choisissez un nouveau mot de passe",
      body: "Un lien de réinitialisation a été demandé pour votre compte.",
      buttonLabel: "Choisir un nouveau mot de passe",
      note: "Ce lien expire dans une heure. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.",
    },
  },
  magic_link: {
    label: "Magic link",
    trigger: "Envoi depuis la fiche utilisateur (valable 30 minutes, à usage unique)",
    linkHelp: "Le bouton ouvre un lien de connexion personnel, à usage unique.",
    defaults: {
      subject: "Votre lien de connexion naocast.",
      heading: "Connexion à naocast.",
      body: "Utilisez ce lien pour vous connecter sans mot de passe.",
      buttonLabel: "Me connecter",
      note: "Ce lien est à usage unique et expire dans 30 minutes. Si vous n'avez rien demandé, ignorez cet email.",
    },
  },
};

export function isTemplateKey(value: string): value is TemplateKey {
  return (TEMPLATE_KEYS as string[]).includes(value);
}

function paragraphsHtml(text: string): string {
  return text
    .trim()
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 14px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

// Rend un mail automatique à partir de ses champs (d'origine ou modifiés) et
// du lien propre à cet envoi.
export function renderTemplate(fields: TemplateFields, url: string) {
  const note = fields.note.trim();
  return {
    subject: fields.subject,
    html: layout(`
<p style="margin:0 0 12px;font-size:18px;font-weight:700">${escapeHtml(fields.heading)}</p>
${paragraphsHtml(fields.body)}
${button(url, fields.buttonLabel)}
${note ? `<p style="margin:0;color:${MUTED};font-size:13px">${escapeHtml(note)}</p>` : ""}`),
    text: `${fields.heading}\n\n${fields.body.trim()}\n\n${fields.buttonLabel} : ${url}${note ? `\n\n${note}` : ""}`,
  };
}

// `body` est du texte brut saisi dans le back office : échappé, les lignes
// vides séparent les paragraphes, un simple retour à la ligne devient un <br>.
export function newsEmail(subject: string, body: string, unsubscribeLink: string) {
  const paragraphs = body
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return {
    subject,
    html: layout(
      `<p style="margin:0 0 16px;font-size:18px;font-weight:700">${escapeHtml(subject)}</p>${paragraphs}`,
      `Vous recevez cet email car vous avez un compte naocast. <a href="${unsubscribeLink}" style="color:${MUTED}">Se désinscrire des actualités</a>`
    ),
    text: `${subject}\n\n${body.trim()}\n\n--\nSe désinscrire des actualités : ${unsubscribeLink}`,
  };
}
