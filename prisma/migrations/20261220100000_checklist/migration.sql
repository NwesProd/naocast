-- Checklist commune à tous les modules.
CREATE TABLE "ChecklistItem" (
  "id" TEXT NOT NULL,
  "podcastId" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "done" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ChecklistItem_podcastId_createdAt_idx" ON "ChecklistItem"("podcastId", "createdAt");
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_podcastId_fkey" FOREIGN KEY ("podcastId") REFERENCES "Podcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChecklistItem" ENABLE ROW LEVEL SECURITY;
