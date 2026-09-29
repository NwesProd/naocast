ALTER TABLE "Episode" ADD COLUMN "shootDate" TIMESTAMP(3);
ALTER TABLE "Episode" ADD COLUMN "shootLocation" TEXT;
ALTER TABLE "Episode" ADD COLUMN "guestMessageContext" TEXT;
ALTER TABLE "Episode" ADD COLUMN "podcastLinks" TEXT;
ALTER TABLE "Episode" ADD COLUMN "guestMessage" TEXT;
ALTER TABLE "Episode" ADD COLUMN "guestMessageGeneratedAt" TIMESTAMP(3);

CREATE TABLE "Guest" (
    "id" TEXT NOT NULL,
    "podcastId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mediaName" TEXT,
    "socialLinks" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Guest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Guest_podcastId_idx" ON "Guest"("podcastId");

ALTER TABLE "Guest" ADD CONSTRAINT "Guest_podcastId_fkey" FOREIGN KEY ("podcastId") REFERENCES "Podcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "EpisodeGuest" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EpisodeGuest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EpisodeGuest_episodeId_guestId_key" ON "EpisodeGuest"("episodeId", "guestId");
CREATE INDEX "EpisodeGuest_episodeId_order_idx" ON "EpisodeGuest"("episodeId", "order");
CREATE INDEX "EpisodeGuest_guestId_idx" ON "EpisodeGuest"("guestId");

ALTER TABLE "EpisodeGuest" ADD CONSTRAINT "EpisodeGuest_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EpisodeGuest" ADD CONSTRAINT "EpisodeGuest_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
