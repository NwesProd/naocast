# naocast.

Module de post-production podcast : rushs bruts vers épisode monté, prêt à exporter, avec un minimum d'intervention manuelle.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Prisma 7 + PostgreSQL (adapter `pg`)
- Auth.js v5 (email + mot de passe)
- Pipeline vidéo : ffmpeg/ffprobe en ligne de commande (silencedetect, trim/concat, overlay)
- Transcription : Whisper large-v3-turbo via Groq (API compatible OpenAI), découpée en chunks de 10 min pour rester sous la limite de 25 Mo
- Stockage : S3-compatible (Cloudflare R2 / Backblaze B2 recommandés), avec repli sur le disque local en dev

## Prérequis machine

- Node 20+
- **ffmpeg et ffprobe sur le PATH** (`brew install ffmpeg`) : indispensable pour l'autocut, le rendu, l'extraction audio et la transcription. Sans ffmpeg, l'upload de rush fonctionne mais le pipeline échoue proprement (statut `FAILED`, bascule possible vers le monteur humain).
- Une clé `GROQ_API_KEY` (console.groq.com) pour activer la transcription (sinon les rushs restent sans transcript, l'analyse du transfert et la sélection de passages à couper via texte ne sont pas disponibles).

## Démarrage

```bash
npm install
npx prisma dev --name poddesk --detach   # base Postgres locale, sans installation système
npx prisma migrate dev
npm run dev        # app Next.js (http://localhost:3000) + worker de traitement, en parallèle
```

`npm run dev` lance l'app et le worker ensemble (via `concurrently`) : un épisode soumis au traitement est bien pris en charge sans étape manuelle. Pour lancer le worker seul (ex. à côté d'un `next dev` déjà en cours ailleurs) : `npm run worker`.

Copier `.env.example`-like : le fichier `.env` généré par `prisma init` contient déjà `DATABASE_URL`, `NEXTAUTH_SECRET`, `GROQ_API_KEY`, les variables `STORAGE_*` et `RUSH_RETENTION_DAYS` à compléter.

## État du scaffold

**Fonctionnel de bout en bout** (testé) : inscription, configuration du podcast, création d'épisode (infos + sélection dans la sidebar), upload direct de rush + transcription synchrone, sélection des passages à couper, autocut, rendu (générique + logo), export vidéo + audio, relecture avec recoupe, bascule vers le montage humain depuis la relecture.

Modules "Tournage", "Extraits" et "Diffusion" : emplacements réservés dans la sidebar, pas encore construits.

**Stubbé, pas encore implémenté :**
- Import via Smash / Google Drive / Dropbox : interface et modèle de données prêts (`lib/pipeline/ingest.ts`), il manque les identifiants d'API de chaque service pour brancher les adaptateurs.
- Synchro + switch multicam automatique (`lib/pipeline/multicam.ts`) : volontairement non construit en premier (cf. brief). Un épisode "caméras séparées" est aujourd'hui redirigé directement vers le montage humain plutôt que de simuler une fonctionnalité qui n'existe pas.
- Paiement en ligne pour l'option montage humain : seul un CTA de contact (mailto) est en place, le flux exact (devis manuel vs paiement intégré) n'est pas tranché.
- Purge automatique des rushs bruts après traitement : la durée de rétention est un champ d'env (`RUSH_RETENTION_DAYS`) mais aucun job de purge ne tourne encore.

WeTransfer est explicitement hors scope (pas d'API de consommation fiable pour des transferts tiers).
