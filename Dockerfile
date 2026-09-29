# Image unique servant les deux process du service (web Next.js et worker de
# traitement) : Railway/Render déploient chacun avec la même image, seule la
# commande de démarrage diffère (cf. les instructions de déploiement).
# ffmpeg est requis par lib/pipeline/ffmpeg.ts pour tout le pipeline vidéo
# (découpe, rendu, extraction audio) : jamais un binding node, toujours le
# binaire en ligne de commande.
FROM node:20-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# `prisma/schema.prisma` doit être présent avant `npm ci` : le postinstall
# (`prisma generate`) en dépend.
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM deps AS builder
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
COPY package.json package-lock.json ./
# --ignore-scripts : le client déjà généré est repris tel quel du stage
# builder juste après, pas besoin de relancer `prisma generate` ici.
RUN npm ci --omit=dev --ignore-scripts
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/app/generated ./app/generated
COPY --from=builder /app/public ./public
COPY worker ./worker
COPY lib ./lib
COPY prisma ./prisma
COPY prisma7.config.ts next.config.ts tsconfig.json ./
COPY auth.ts auth.config.ts proxy.ts ./

EXPOSE 3000
# Commande par défaut : le service web. Les migrations (`prisma migrate
# deploy`) passent par le "Pre-Deploy Command" de Railway plutôt que par ici,
# cf. instructions de déploiement. Le service worker override cette commande
# avec `npm run worker`.
CMD ["npm", "run", "start"]
