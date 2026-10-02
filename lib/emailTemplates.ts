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

export function welcomeEmail(appBaseUrl: string) {
  const url = `${appBaseUrl}/podcast`;
  return {
    subject: "Bienvenue sur naocast.",
    html: layout(`
<p style="margin:0 0 12px;font-size:18px;font-weight:700">Bienvenue sur naocast.</p>
<p style="margin:0 0 12px">Votre compte est prêt. Pour monter votre premier épisode, trois étapes :</p>
<ol style="margin:0 0 12px;padding-left:20px">
<li>Configurez votre podcast : titre, pochette, génériques et logo.</li>
<li>Créez un épisode et importez vos rushs.</li>
<li>Laissez naocast. monter, puis validez le résultat en relecture.</li>
</ol>
${button(url, "Configurer mon podcast")}
<p style="margin:0">Une question ? Répondez simplement à cet email.</p>`),
    text: `Bienvenue sur naocast.\n\nVotre compte est prêt. Pour monter votre premier épisode :\n1. Configurez votre podcast (titre, pochette, génériques, logo)\n2. Créez un épisode et importez vos rushs\n3. Laissez naocast. monter, puis validez en relecture\n\nCommencer : ${url}\n\nUne question ? Répondez simplement à cet email.`,
  };
}

export function passwordResetEmail(resetUrl: string) {
  return {
    subject: "Réinitialisation de votre mot de passe naocast.",
    html: layout(`
<p style="margin:0 0 12px;font-size:18px;font-weight:700">Choisissez un nouveau mot de passe</p>
<p style="margin:0 0 12px">Un lien de réinitialisation a été demandé pour votre compte.</p>
${button(resetUrl, "Choisir un nouveau mot de passe")}
<p style="margin:0;color:${MUTED};font-size:13px">Ce lien expire dans une heure. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>`),
    text: `Un lien de réinitialisation a été demandé pour votre compte naocast.\n\nChoisir un nouveau mot de passe : ${resetUrl}\n\nCe lien expire dans une heure. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.`,
  };
}

export function magicLinkEmail(loginUrl: string) {
  return {
    subject: "Votre lien de connexion naocast.",
    html: layout(`
<p style="margin:0 0 12px;font-size:18px;font-weight:700">Connexion à naocast.</p>
<p style="margin:0 0 12px">Utilisez ce lien pour vous connecter sans mot de passe.</p>
${button(loginUrl, "Me connecter")}
<p style="margin:0;color:${MUTED};font-size:13px">Ce lien est à usage unique et expire dans 30 minutes. Si vous n'avez rien demandé, ignorez cet email.</p>`),
    text: `Utilisez ce lien pour vous connecter à naocast. sans mot de passe : ${loginUrl}\n\nCe lien est à usage unique et expire dans 30 minutes. Si vous n'avez rien demandé, ignorez cet email.`,
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
