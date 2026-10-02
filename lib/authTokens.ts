import { randomBytes, createHash } from "crypto";
import { prisma } from "@/lib/db";
import { appUrl } from "@/lib/email";

export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1h
export const MAGIC_LINK_TTL_MS = 30 * 60 * 1000; // 30 min

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Seul le hash est stocké : la valeur en clair n'existe que dans le lien
// envoyé par email (une fuite de la base ne suffit pas à s'en servir).
export async function createPasswordResetLink(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({
    data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS) },
  });
  return `${appUrl()}/reset-password?token=${token}`;
}

export async function createMagicLoginLink(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await prisma.loginToken.create({
    data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS) },
  });
  return `${appUrl()}/magic-login?token=${token}`;
}
