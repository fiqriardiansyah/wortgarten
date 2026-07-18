-- DropIndex
DROP INDEX "Story_userId_status_idx";

-- AlterTable
ALTER TABLE "Story" DROP COLUMN "body",
DROP COLUMN "minutes",
DROP COLUMN "newWordCount",
DROP COLUMN "status",
DROP COLUMN "tokenMap",
ADD COLUMN     "blurb" TEXT,
ADD COLUMN     "coverageKnownPct" INTEGER NOT NULL,
ADD COLUMN     "estMinutes" INTEGER NOT NULL,
ADD COLUMN     "glossary" JSONB NOT NULL,
ADD COLUMN     "newWords" TEXT[],
ADD COLUMN     "paragraphs" JSONB NOT NULL,
ADD COLUMN     "translation" TEXT;

-- DropEnum
DROP TYPE "StoryStatus";

-- CreateIndex
CREATE INDEX "Story_userId_readAt_idx" ON "Story"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Story_userId_createdAt_idx" ON "Story"("userId", "createdAt");

