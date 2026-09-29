CREATE TABLE "EpisodeSpeaker" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EpisodeSpeaker_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EpisodeSpeaker_episodeId_label_key" ON "EpisodeSpeaker"("episodeId", "label");

ALTER TABLE "EpisodeSpeaker" ADD CONSTRAINT "EpisodeSpeaker_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
