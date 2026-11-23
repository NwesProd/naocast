-- Migration d'un podcast depuis un autre hébergeur + comptage des téléchargements audio.
ALTER TABLE "Podcast" ADD COLUMN "migrationFeedUrl" TEXT;
ALTER TABLE "Podcast" ADD COLUMN "migrationStatus" TEXT;
ALTER TABLE "Episode" ADD COLUMN "importAudioUrl" TEXT;

CREATE TABLE "AudioDownload" (
  "id" TEXT NOT NULL,
  "episodeId" TEXT NOT NULL,
  "day" DATE NOT NULL,
  "visitorHash" TEXT NOT NULL,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AudioDownload_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AudioDownload_episodeId_visitorHash_day_key" ON "AudioDownload"("episodeId", "visitorHash", "day");
CREATE INDEX "AudioDownload_episodeId_day_idx" ON "AudioDownload"("episodeId", "day");
ALTER TABLE "AudioDownload" ADD CONSTRAINT "AudioDownload_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AudioDownload" ENABLE ROW LEVEL SECURITY;
