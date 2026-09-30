-- AlterEnum
ALTER TYPE "JobType" ADD VALUE 'MANUAL_TRANSCRIBE';

-- AlterTable
ALTER TABLE "Episode" ADD COLUMN     "transcriptRushId" TEXT;

