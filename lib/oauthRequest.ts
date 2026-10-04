import { prisma } from "@/lib/db";

// Paramètres d'une demande d'autorisation OAuth, validés contre le client enregistré.
// Une adresse de redirection non enregistrée n'est JAMAIS suivie (on affiche une erreur).
export interface AuthorizeRequest {
  clientId: string;
  clientName: string;
  redirectUri: string;
  codeChallenge: string;
  state: string | null;
}

export async function validateAuthorizeParams(get: (name: string) => string | null | undefined): Promise<AuthorizeRequest | { error: string }> {
  const clientId = get("client_id");
  const redirectUri = get("redirect_uri");
  const codeChallenge = get("code_challenge");
  if (get("response_type") && get("response_type") !== "code") return { error: "Type de réponse non géré." };
  if (!clientId || !redirectUri) return { error: "Demande de connexion incomplète." };

  const client = await prisma.oAuthClient.findUnique({ where: { id: clientId } });
  if (!client || !client.redirectUris.includes(redirectUri)) return { error: "Application inconnue ou adresse de retour non autorisée." };
  if (!codeChallenge || (get("code_challenge_method") && get("code_challenge_method") !== "S256")) {
    return { error: "La connexion sécurisée (PKCE) est requise." };
  }
  if (codeChallenge.length < 43 || codeChallenge.length > 128) return { error: "Demande de connexion invalide." };

  return { clientId: client.id, clientName: client.name, redirectUri, codeChallenge, state: get("state") || null };
}
