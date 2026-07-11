-- DropForeignKey (old scaffold model)
ALTER TABLE "Word" DROP CONSTRAINT "Word_userId_fkey";

-- DropTable (old scaffold models, superseded)
DROP TABLE "Word";

-- DropEnum (old scaffold enum, superseded by new WordLevel below)
DROP TYPE "WordLevel";

-- CreateEnum
CREATE TYPE "PartOfSpeech" AS ENUM ('NOUN', 'VERB', 'ADJECTIVE', 'ADVERB', 'PRONOUN', 'PREPOSITION', 'CONJUNCTION', 'ARTICLE', 'NUMERAL', 'PARTICLE', 'OTHER');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MASCULINE', 'FEMININE', 'NEUTER');

-- CreateEnum
CREATE TYPE "Provenance" AS ENUM ('SEED', 'AI', 'USER');

-- CreateEnum
CREATE TYPE "WordLevel" AS ENUM ('NEW', 'RECOGNIZE', 'RECALL', 'PRODUCE', 'MASTERED');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('PICK_MEANING', 'TYPE_WORD', 'BUILD_SENTENCE', 'WRITE_SENTENCE');

-- CreateEnum
CREATE TYPE "AttemptResult" AS ENUM ('CORRECT', 'CORRECT_WITH_TYPO', 'WRONG_GENDER', 'WRONG_MEANING', 'WRONG_FORM', 'EMPTY');

-- CreateEnum
CREATE TYPE "FsrsRating" AS ENUM ('AGAIN', 'HARD', 'GOOD', 'EASY');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('READY', 'USED', 'FAILED_CHECK');

-- CreateEnum
CREATE TYPE "StoryStatus" AS ENUM ('READY', 'READ', 'FAILED_CHECK');

-- CreateEnum
CREATE TYPE "AiSource" AS ENUM ('GROQ', 'OLLAMA');

-- AlterTable (Story: repurposed from static content to per-user generated content)
ALTER TABLE "Story" DROP COLUMN "content",
DROP COLUMN "updatedAt",
ADD COLUMN     "body" TEXT NOT NULL,
ADD COLUMN     "newWordCount" INTEGER NOT NULL,
ADD COLUMN     "readAt" TIMESTAMP(3),
ADD COLUMN     "source" "AiSource",
ADD COLUMN     "status" "StoryStatus" NOT NULL DEFAULT 'READY',
ADD COLUMN     "tokenMap" JSONB NOT NULL,
ADD COLUMN     "userId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "Lexeme" (
    "id" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'de',
    "lemma" TEXT NOT NULL,
    "partOfSpeech" "PartOfSpeech" NOT NULL,
    "gender" "Gender",
    "plural" TEXT,
    "separablePrefix" TEXT,
    "auxiliary" TEXT,
    "government" TEXT,
    "frequencyRank" INTEGER,
    "provenance" "Provenance" NOT NULL DEFAULT 'SEED',
    "isVerified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Lexeme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sense" (
    "id" TEXT NOT NULL,
    "lexemeId" TEXT NOT NULL,
    "translation" TEXT NOT NULL,
    "definition" TEXT,
    "example" TEXT,
    "cefrLevel" TEXT,

    CONSTRAINT "Sense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WordForm" (
    "id" TEXT NOT NULL,
    "lexemeId" TEXT NOT NULL,
    "surface" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "features" JSONB,

    CONSTRAINT "WordForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserWord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "senseId" TEXT NOT NULL,
    "level" "WordLevel" NOT NULL DEFAULT 'NEW',
    "stability" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "difficulty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reps" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "lastReviewedAt" TIMESTAMP(3),
    "customTranslation" TEXT,
    "sourceSentence" TEXT,
    "sourceType" TEXT,
    "note" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserWord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attempt" (
    "id" TEXT NOT NULL,
    "userWordId" TEXT NOT NULL,
    "taskType" "TaskType" NOT NULL,
    "result" "AttemptResult" NOT NULL,
    "responseTimeMs" INTEGER NOT NULL,
    "rating" "FsrsRating" NOT NULL,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userWordId" TEXT NOT NULL,
    "type" "TaskType" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'READY',
    "source" "AiSource",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiQuota" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "source" "AiSource" NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "limit" INTEGER NOT NULL,

    CONSTRAINT "AiQuota_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lexeme_language_frequencyRank_idx" ON "Lexeme"("language", "frequencyRank");

-- CreateIndex
CREATE UNIQUE INDEX "Lexeme_language_lemma_partOfSpeech_gender_key" ON "Lexeme"("language", "lemma", "partOfSpeech", "gender");

-- CreateIndex
CREATE INDEX "Sense_lexemeId_idx" ON "Sense"("lexemeId");

-- CreateIndex
CREATE INDEX "WordForm_normalized_idx" ON "WordForm"("normalized");

-- CreateIndex
CREATE INDEX "WordForm_lexemeId_idx" ON "WordForm"("lexemeId");

-- CreateIndex
CREATE INDEX "UserWord_userId_dueAt_idx" ON "UserWord"("userId", "dueAt");

-- CreateIndex
CREATE INDEX "UserWord_userId_level_idx" ON "UserWord"("userId", "level");

-- CreateIndex
CREATE UNIQUE INDEX "UserWord_userId_senseId_key" ON "UserWord"("userId", "senseId");

-- CreateIndex
CREATE INDEX "Attempt_userWordId_answeredAt_idx" ON "Attempt"("userWordId", "answeredAt");

-- CreateIndex
CREATE INDEX "Task_userId_status_idx" ON "Task"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AiQuota_date_source_key" ON "AiQuota"("date", "source");

-- CreateIndex
CREATE INDEX "Story_userId_status_idx" ON "Story"("userId", "status");

-- AddForeignKey
ALTER TABLE "Sense" ADD CONSTRAINT "Sense_lexemeId_fkey" FOREIGN KEY ("lexemeId") REFERENCES "Lexeme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WordForm" ADD CONSTRAINT "WordForm_lexemeId_fkey" FOREIGN KEY ("lexemeId") REFERENCES "Lexeme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserWord" ADD CONSTRAINT "UserWord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserWord" ADD CONSTRAINT "UserWord_senseId_fkey" FOREIGN KEY ("senseId") REFERENCES "Sense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_userWordId_fkey" FOREIGN KEY ("userWordId") REFERENCES "UserWord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_userWordId_fkey" FOREIGN KEY ("userWordId") REFERENCES "UserWord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
