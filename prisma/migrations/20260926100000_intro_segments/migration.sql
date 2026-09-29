ALTER TABLE "Episode" ADD COLUMN "introTeaserKey" TEXT;

CREATE TABLE "IntroSegment" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "startMs" INTEGER NOT NULL,
    "endMs" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntroSegment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IntroSegment_episodeId_order_idx" ON "IntroSegment"("episodeId", "order");

ALTER TABLE "IntroSegment" ADD CONSTRAINT "IntroSegment_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
