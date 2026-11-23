-- CreateTable
CREATE TABLE "RelatedContent" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER,
    "comments" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RelatedContent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RelatedContent_episodeId_idx" ON "RelatedContent"("episodeId");

-- CreateIndex
CREATE UNIQUE INDEX "RelatedContent_episodeId_videoId_key" ON "RelatedContent"("episodeId", "videoId");

-- AddForeignKey
ALTER TABLE "RelatedContent" ADD CONSTRAINT "RelatedContent_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Pas d'accès via l'API publique Supabase (cf. 20261007100000_enable_rls).
ALTER TABLE "RelatedContent" ENABLE ROW LEVEL SECURITY;
