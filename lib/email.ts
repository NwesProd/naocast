// Envoi d'email minimal : Resend si RESEND_API_KEY est configuré, sinon le
// lien est simplement loggé côté serveur (dev sans dépendance externe, testable
// de bout en bout sans compte email).
export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.log(`[email] (dev, aucun RESEND_API_KEY) lien de réinitialisation pour ${to} : ${resetUrl}`);
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || "naocast. <onboarding@resend.dev>",
      to,
      subject: "Réinitialisation de votre mot de passe naocast.",
      html: `<p>Un lien de réinitialisation a été demandé pour ce compte.</p>
<p><a href="${resetUrl}">Choisir un nouveau mot de passe</a></p>
<p>Ce lien expire dans une heure. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>`,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Échec de l'envoi de l'email (Resend, HTTP ${res.status}) : ${body}`);
  }
}

// Étape "1. Monteur" → "J'ai déjà un monteur" → "Je lui envoie les rushs et
// lui donne des indications" : après le tunnel (import, découpes,
// génériques...), un email récapitulatif est envoyé au monteur personnel de
// l'utilisateur, aucun tarif naocast. impliqué, contrairement à NEED_EDITOR.
export async function sendEpisodeToOwnEditor(to: string, subject: string, htmlBody: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.log(`[email] (dev, aucun RESEND_API_KEY) récapitulatif épisode pour ${to} :\n${htmlBody}`);
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || "naocast. <onboarding@resend.dev>",
      to,
      subject,
      html: htmlBody,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Échec de l'envoi de l'email (Resend, HTTP ${res.status}) : ${body}`);
  }
}
