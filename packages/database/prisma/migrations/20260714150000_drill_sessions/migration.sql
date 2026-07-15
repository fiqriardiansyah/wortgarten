-- CreateEnum
CREATE TYPE "DrillSessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ABANDONED');

-- AlterEnum
ALTER TYPE "AttemptResult" ADD VALUE 'MISSING_UMLAUT';
ALTER TYPE "AttemptResult" ADD VALUE 'MISSING_ARTICLE';

-- CreateTable
CREATE TABLE "DrillSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "DrillSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "plan" JSONB NOT NULL,
    "currentIndex" INTEGER NOT NULL DEFAULT 0,
    "isPractice" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "DrillSession_pkey" PRIMARY KEY ("id")
);

-- AlterTable (Attempt has zero production rows — safe to add NOT NULL with no backfill)
ALTER TABLE "Attempt" ADD COLUMN     "drillSessionId" TEXT NOT NULL,
ADD COLUMN     "isRetry" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "planItemId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "DrillSession_userId_status_idx" ON "DrillSession"("userId", "status");

-- CreateIndex
CREATE INDEX "Attempt_userWordId_taskType_answeredAt_idx" ON "Attempt"("userWordId", "taskType", "answeredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Attempt_drillSessionId_planItemId_key" ON "Attempt"("drillSessionId", "planItemId");

-- AddForeignKey
ALTER TABLE "DrillSession" ADD CONSTRAINT "DrillSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_drillSessionId_fkey" FOREIGN KEY ("drillSessionId") REFERENCES "DrillSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
