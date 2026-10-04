-- AlterTable
ALTER TABLE "Episode" ADD COLUMN     "guestBroadcastMessage" TEXT,
ADD COLUMN     "guestBroadcastMessageGeneratedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Guest" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

