import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { authConfig } from "@/auth.config";
import { hashToken } from "@/lib/authTokens";

// Config complète (runtime Node), utilisée par les routes API et les Server
// Components. Le middleware (Edge) utilise auth.config.ts seul, sans ce
// provider Credentials qui dépend de Prisma/bcrypt.
export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, email: user.email };
      },
    }),
    // Magic link envoyé depuis le back office : jeton à usage unique, consommé
    // ici de façon atomique (updateMany conditionné à usedAt: null) pour que
    // deux connexions simultanées avec le même lien ne passent jamais toutes
    // les deux.
    Credentials({
      id: "magic-link",
      name: "Magic link",
      credentials: { token: { label: "Jeton", type: "text" } },
      async authorize(credentials) {
        const token = credentials?.token as string | undefined;
        if (!token) return null;

        const loginToken = await prisma.loginToken.findUnique({ where: { tokenHash: hashToken(token) } });
        if (!loginToken || loginToken.usedAt || loginToken.expiresAt < new Date()) return null;

        const consumed = await prisma.loginToken.updateMany({
          where: { id: loginToken.id, usedAt: null },
          data: { usedAt: new Date() },
        });
        if (consumed.count !== 1) return null;

        const user = await prisma.user.findUnique({ where: { id: loginToken.userId } });
        return user ? { id: user.id, email: user.email } : null;
      },
    }),
  ],
});
