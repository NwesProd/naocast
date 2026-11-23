-- AlterTable
ALTER TABLE "Podcast" ADD COLUMN "youtubeChannelId" TEXT,
ADD COLUMN "youtubeChannelTitle" TEXT,
ADD COLUMN "youtubeUploadsPlaylist" TEXT;

-- AlterTable
ALTER TABLE "Episode" ADD COLUMN "youtubeVideoId" TEXT,
ADD COLUMN "youtubeVideoTitle" TEXT;

-- CreateTable
CREATE TABLE "StatSnapshot" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "views" INTEGER NOT NULL,
    "likes" INTEGER,
    "comments" INTEGER,

    CONSTRAINT "StatSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StatSnapshot_episodeId_source_day_key" ON "StatSnapshot"("episodeId", "source", "day");

-- CreateIndex
CREATE INDEX "StatSnapshot_episodeId_day_idx" ON "StatSnapshot"("episodeId", "day");

-- AddForeignKey
ALTER TABLE "StatSnapshot" ADD CONSTRAINT "StatSnapshot_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Pas d'accès via l'API publique Supabase (cf. 20261007100000_enable_rls).
ALTER TABLE "StatSnapshot" ENABLE ROW LEVEL SECURITY;
