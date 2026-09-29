CREATE TYPE "EditorChoice" AS ENUM ('PODKO', 'NEED_EDITOR', 'HAS_EDITOR_SEND', 'HAS_EDITOR_IMPORT');
CREATE TYPE "IntroOutroSource" AS ENUM ('PODCAST', 'EPISODE');

ALTER TABLE "Episode" ADD COLUMN "editorChoice" "EditorChoice";
ALTER TABLE "Episode" ADD COLUMN "introSource" "IntroOutroSource" NOT NULL DEFAULT 'PODCAST';
ALTER TABLE "Episode" ADD COLUMN "introKey" TEXT;
ALTER TABLE "Episode" ADD COLUMN "outroSource" "IntroOutroSource" NOT NULL DEFAULT 'PODCAST';
ALTER TABLE "Episode" ADD COLUMN "outroKey" TEXT;
