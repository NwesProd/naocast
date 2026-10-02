-- AlterTable
ALTER TABLE "Episode" ADD COLUMN     "introValidatedExternally" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "montageValidatedExternally" BOOLEAN NOT NULL DEFAULT false;

