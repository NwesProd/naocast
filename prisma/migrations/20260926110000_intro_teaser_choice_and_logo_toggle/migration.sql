-- CreateEnum
CREATE TYPE "IntroTeaserChoice" AS ENUM ('NONE', 'MODULE', 'IMPORT');

-- AlterTable
ALTER TABLE "Episode" ADD COLUMN "introTeaserValidated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Episode" ADD COLUMN "introTeaserImportKey" TEXT;
ALTER TABLE "Episode" ADD COLUMN "introTeaserChoice" "IntroTeaserChoice" NOT NULL DEFAULT 'NONE';
ALTER TABLE "Episode" ADD COLUMN "logoEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "IntroSegment" ADD COLUMN "removedRanges" JSONB;
