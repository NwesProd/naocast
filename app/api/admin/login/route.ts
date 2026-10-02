import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { isAdminEmail, startAdminSession } from "@/lib/admin";

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

// Limite les essais de connexion (par IP et email) : 5 échecs puis blocage
// 15 minutes. En mémoire, donc remis à zéro à chaque redémarrage du service :
// suffisant contre du bruteforce basique sur un accès réservé à quelques
// personnes, pas une protection contre une attaque distribuée.
const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;
const failures = new Map<string, { count: number; firstAt: number }>();

function throttleKey(req: Request, email: string): string {
  const ip = (req.headers.get("x-forwarded-for") || "inconnue").split(",")[0].trim();
  return `${ip}|${email.toLowerCase()}`;
}

function isBlocked(key: string): boolean {
  const entry = failures.get(key);
  if (!entry) return false;
  if (Date.now() - entry.firstAt > WINDOW_MS) {
    failures.delete(key);
    return false;
  }
  return entry.count >= MAX_FAILURES;
}

function recordFailure(key: string) {
  const entry = failures.get(key);
  if (!entry || Date.now() - entry.firstAt > WINDOW_MS) failures.set(key, { count: 1, firstAt: Date.now() });
  else entry.count += 1;
}

// Hash factice : on compare toujours un mot de passe avec bcrypt, même quand
// l'email n'existe pas ou n'est pas admin, pour que le temps de réponse ne
// révèle rien sur les comptes.
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", 10);

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Email ou mot de passe incorrect." }, { status: 401 });
  const { email, password } = parsed.data;

  const key = throttleKey(req, email);
  if (isBlocked(key)) {
    return NextResponse.json({ error: "Trop d'essais. Réessaie dans quelques minutes." }, { status: 429 });
  }

  const user = isAdminEmail(email) ? await prisma.user.findUnique({ where: { email } }) : null;
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !valid) {
    recordFailure(key);
    return NextResponse.json({ error: "Email ou mot de passe incorrect." }, { status: 401 });
  }

  failures.delete(key);
  await startAdminSession(user.id);
  return NextResponse.json({ ok: true });
}
