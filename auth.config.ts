import type { NextAuthConfig } from "next-auth";

// Config "edge-safe" : ni Prisma ni bcrypt ici (le middleware tourne sur le
// runtime Edge, qui ne supporte pas les modules Node natifs dont dépend
// l'adapter Postgres). Le provider Credentials avec son `authorize` (qui a
// besoin de la base) vit uniquement dans auth.ts, importé par les routes API
// et les Server Components (runtime Node classique).
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user) session.user.id = token.id as string;
      return session;
    },
  },
} satisfies NextAuthConfig;
