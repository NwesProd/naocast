-- Écoutes d'un épisode comptées chez l'ancien hébergeur (reprises à la migration).
ALTER TABLE "Episode" ADD COLUMN "importedPlays" INTEGER NOT NULL DEFAULT 0;
