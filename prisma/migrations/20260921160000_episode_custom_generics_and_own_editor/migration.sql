CREATE TYPE "GenericCreationMode" AS ENUM ('IMPORT', 'CUSTOM');
CREATE TYPE "GenericCustomMode" AS ENUM ('TEASER_COMPILATION', 'OWN_IDEA');

ALTER TABLE "Episode" ADD COLUMN "introCreationMode" "GenericCreationMode";
ALTER TABLE "Episode" ADD COLUMN "introCustomMode" "GenericCustomMode";
ALTER TABLE "Episode" ADD COLUMN "introCustomDescription" TEXT;
ALTER TABLE "Episode" ADD COLUMN "outroCreationMode" "GenericCreationMode";
ALTER TABLE "Episode" ADD COLUMN "outroCustomMode" "GenericCustomMode";
ALTER TABLE "Episode" ADD COLUMN "outroCustomDescription" TEXT;
ALTER TABLE "Episode" ADD COLUMN "ownEditorEmail" TEXT;
