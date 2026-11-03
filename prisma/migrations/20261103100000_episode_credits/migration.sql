-- CreateTable
CREATE TABLE "EpisodeCredit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 1,
    "reason" TEXT,
    "createdByEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EpisodeCredit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EpisodeCredit_userId_createdAt_idx" ON "EpisodeCredit"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "EpisodeCredit" ADD CONSTRAINT "EpisodeCredit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Pas d'accès via l'API publique Supabase (cf. 20261007100000_enable_rls).
ALTER TABLE "EpisodeCredit" ENABLE ROW LEVEL SECURITY;
