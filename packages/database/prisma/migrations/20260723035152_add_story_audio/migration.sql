-- AlterTable
ALTER TABLE "Story" ADD COLUMN     "audioKey" TEXT,
ADD COLUMN     "audioSync" TEXT,
ADD COLUMN     "sentenceTimings" JSONB;

