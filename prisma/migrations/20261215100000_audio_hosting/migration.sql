-- Hébergement audio naocast : réglages du podcast pour le flux RSS, description et publication des épisodes.
ALTER TABLE "Podcast" ADD COLUMN "hostingMode" TEXT;
ALTER TABLE "Podcast" ADD COLUMN "rssSlug" TEXT;
ALTER TABLE "Podcast" ADD COLUMN "author" TEXT;
ALTER TABLE "Podcast" ADD COLUMN "ownerEmail" TEXT;
ALTER TABLE "Podcast" ADD COLUMN "description" TEXT;
ALTER TABLE "Podcast" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'fr';
ALTER TABLE "Podcast" ADD COLUMN "category" TEXT;
ALTER TABLE "Podcast" ADD COLUMN "explicit" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Podcast" ADD COLUMN "website" TEXT;
ALTER TABLE "Podcast" ADD COLUMN "platformLinks" JSONB;
CREATE UNIQUE INDEX "Podcast_rssSlug_key" ON "Podcast"("rssSlug");

ALTER TABLE "Episode" ADD COLUMN "description" TEXT;
ALTER TABLE "Episode" ADD COLUMN "audioPublishedAt" TIMESTAMP(3);
ALTER TABLE "Episode" ADD COLUMN "rssGuid" TEXT;
