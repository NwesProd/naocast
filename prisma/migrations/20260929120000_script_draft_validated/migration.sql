ALTER TABLE "Episode" ADD COLUMN "scriptDraft" TEXT;
ALTER TABLE "Episode" ADD COLUMN "scriptValidated" BOOLEAN NOT NULL DEFAULT false;
