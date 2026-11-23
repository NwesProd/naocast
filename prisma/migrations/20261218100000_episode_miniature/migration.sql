-- Module Miniature : pochette audio et miniature vidéo de chaque épisode.
ALTER TABLE "Episode" ADD COLUMN "coverKey" TEXT;
ALTER TABLE "Episode" ADD COLUMN "thumbnailKey" TEXT;
