-- Suppression du module "Intro" (teaser de punchlines) : le générique de début, lui, reste.
-- DropTable
DROP TABLE "IntroSegment";

-- AlterTable
ALTER TABLE "Episode" DROP COLUMN "introTeaserKey",
DROP COLUMN "introTeaserValidated",
DROP COLUMN "introTeaserImportKey",
DROP COLUMN "introTeaserChoice",
DROP COLUMN "introEditorNotes",
DROP COLUMN "introValidatedExternally";

-- DropEnum
DROP TYPE "IntroTeaserChoice";
