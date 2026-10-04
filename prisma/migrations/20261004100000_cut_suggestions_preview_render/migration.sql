-- AlterEnum
ALTER TYPE "JobType" ADD VALUE 'PREVIEW_RENDER';

-- CreateTable
CREATE TABLE "CutSuggestion" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "startMs" INTEGER NOT NULL,
    "endMs" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CutSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CutSuggestion_episodeId_idx" ON "CutSuggestion"("episodeId");

-- AddForeignKey
ALTER TABLE "CutSuggestion" ADD CONSTRAINT "CutSuggestion_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

