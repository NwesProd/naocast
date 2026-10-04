-- CreateEnum
CREATE TYPE "EditingRequestStatus" AS ENUM ('PENDING_PAYMENT', 'PAID');

-- CreateTable
CREATE TABLE "EditingRequest" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT,
    "userId" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "podcastTitle" TEXT,
    "episodeTitle" TEXT,
    "notes" TEXT,
    "status" "EditingRequestStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "stripeSessionId" TEXT,
    "amountTotal" INTEGER,
    "currency" TEXT,
    "paidAt" TIMESTAMP(3),
    "emailSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EditingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EditingRequest_stripeSessionId_key" ON "EditingRequest"("stripeSessionId");

-- CreateIndex
CREATE INDEX "EditingRequest_status_createdAt_idx" ON "EditingRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "EditingRequest_episodeId_idx" ON "EditingRequest"("episodeId");

-- AddForeignKey
ALTER TABLE "EditingRequest" ADD CONSTRAINT "EditingRequest_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

