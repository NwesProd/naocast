-- AlterTable
ALTER TABLE "Episode" ADD COLUMN "shootAt" TIMESTAMP(3),
ADD COLUMN "shootMode" TEXT,
ADD COLUMN "shootPlace" TEXT,
ADD COLUMN "shootStartedAt" TIMESTAMP(3),
ADD COLUMN "shootEndedAt" TIMESTAMP(3),
ADD COLUMN "shootPartIndex" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "EpisodeGuest" ADD COLUMN "notified" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ShootMarker" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "atMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShootMarker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShootMarker_episodeId_atMs_idx" ON "ShootMarker"("episodeId", "atMs");

-- AddForeignKey
ALTER TABLE "ShootMarker" ADD CONSTRAINT "ShootMarker_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Pas d'accès via l'API publique Supabase (cf. 20261007100000_enable_rls).
ALTER TABLE "ShootMarker" ENABLE ROW LEVEL SECURITY;
