import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";

// Back office : une connexion et une session TOTALEMENT séparées de celles de
// l'app. Se connecter à l'app ne donne aucun accès à /admin, et se connecter
// au back office ne connecte pas à l'app (cookie propre, formulaire propre
// sur /admin/login, aucun lien depuis l'app).
//
// Seuls les emails listés dans ADMIN_EMAILS (séparés par des virgules,
// amandine@nwes.fr par défaut) peuvent ouvrir une session, avec le mot de
// passe de leur compte. Chaque page et chaque route /api/admin revérifie
// l'accès côté serveur, en repartant de la base : masquer un lien ne protège
// rien.
export const ADMIN_COOKIE = "naocast_admin";
const SESSION_TTL_SECONDS = 8 * 60 * 60; // 8 h

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || "amandine@nwes.fr")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && adminEmails().includes(email.toLowerCase());
}

// Secret de signature du cookie. Sans secret configuré en production on
// refuse de signer (échec explicite) plutôt que d'utiliser une valeur connue.
function sessionSecret(): string {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET ou NEXTAUTH_SECRET manquant.");
  return "dev-admin-session-secret";
}

function sign(payload: string): string {
  return createHmac("sha256", sessionSecret()).update(`admin-session:${payload}`).digest("base64url");
}

function createSessionToken(userId: string): string {
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function readSessionToken(token: string): string | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { uid?: string; exp?: number };
    if (!data.uid || !data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
    return data.uid;
  } catch {
    return null;
  }
}

export async function startAdminSession(userId: string): Promise<void> {
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, createSessionToken(userId), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function endAdminSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(ADMIN_COOKIE);
}

export async function getAdminUser(): Promise<{ id: string; email: string } | null> {
  const jar = await cookies();
  const token = jar.get(ADMIN_COOKIE)?.value;
  if (!token) return null;

  const userId = readSessionToken(token);
  if (!userId) return null;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
  return user && isAdminEmail(user.email) ? user : null;
}

export class AdminError extends Error {
  constructor() {
    super("Accès réservé aux administrateurs.");
    this.name = "AdminError";
  }
}

// Pour les routes /api/admin : lève AdminError (à mapper en 403).
export async function requireAdmin(): Promise<{ id: string; email: string }> {
  const admin = await getAdminUser();
  if (!admin) throw new AdminError();
  return admin;
}

// Pour les pages : renvoie vers le formulaire de connexion du back office.
export async function requireAdminPage(): Promise<{ id: string; email: string }> {
  const admin = await getAdminUser();
  if (!admin) redirect("/admin/login");
  return admin;
}
