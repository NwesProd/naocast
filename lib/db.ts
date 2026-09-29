import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 : plus d'URL dans le schema, la connexion passe par un adapter
// explicite au runtime (cf. https://pris.ly/d/prisma7-client-config).
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

// Cet environnement de dev/sandbox ferme parfois la connexion Postgres côté
// serveur de façon impromptue, même sur une requête quasi instantanée
// (Prisma P1017 "Server has closed the connection" / P1001 "Can't reach
// database server"), déjà constaté et contourné côté worker (process longue
// durée, cf. worker/run.ts) mais tout aussi capable de toucher une requête
// web ponctuelle (ex. la sidebar perdant l'épisode sélectionné suite à un
// échec silencieux de GET /api/episodes/[id], ou un rendu de page en 500).
// Centralisé ici via une extension du client plutôt que route par route :
// une nouvelle tentative repart sur une connexion fraîche du pool.
function isRetryableConnectionError(err: unknown): boolean {
  const code = (err as { code?: string } | null | undefined)?.code;
  return code === "P1017" || code === "P1001";
}

function createPrismaClient() {
  return new PrismaClient({ adapter }).$extends({
    query: {
      async $allOperations({ args, query }) {
        const MAX_ATTEMPTS = 3;
        let lastErr: unknown;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          try {
            return await query(args);
          } catch (err) {
            lastErr = err;
            if (attempt === MAX_ATTEMPTS || !isRetryableConnectionError(err)) throw err;
            await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
          }
        }
        throw lastErr;
      },
    },
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createPrismaClient> };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
