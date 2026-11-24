-- Validation manuelle du module Miniature (sans avoir importé la pochette et la miniature).
ALTER TABLE "Episode" ADD COLUMN "miniatureValidated" BOOLEAN NOT NULL DEFAULT false;
