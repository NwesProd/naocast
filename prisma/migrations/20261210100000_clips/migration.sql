-- AlterTable
ALTER TABLE "EditingRequest" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'EPISODE',
ADD COLUMN "clipId" TEXT;

-- CreateTable
CREATE TABLE "Clip" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startMs" INTEGER NOT NULL,
    "endMs" INTEGER NOT NULL,
    "excerpt" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IDEA',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "editor" TEXT,
    "fileKey" TEXT,
    "fileName" TEXT,
    "publishedUrl" TEXT,
    "youtubeVideoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Clip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Clip_episodeId_status_idx" ON "Clip"("episodeId", "status");

-- AddForeignKey
ALTER TABLE "Clip" ADD CONSTRAINT "Clip_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Pas d'accès via l'API publique Supabase (cf. 20261007100000_enable_rls).
ALTER TABLE "Clip" ENABLE ROW LEVEL SECURITY;
