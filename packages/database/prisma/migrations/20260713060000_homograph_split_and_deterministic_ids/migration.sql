-- DropIndex
DROP INDEX "Lexeme_language_lemma_partOfSpeech_gender_key";

-- AlterTable
ALTER TABLE "Lexeme" ADD COLUMN     "etymologyNumber" INTEGER,
ADD COLUMN     "sourceKey" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Sense" ADD COLUMN     "sourceKey" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Lexeme_sourceKey_key" ON "Lexeme"("sourceKey");

-- CreateIndex
CREATE INDEX "Lexeme_language_lemma_partOfSpeech_idx" ON "Lexeme"("language", "lemma", "partOfSpeech");

-- CreateIndex
CREATE UNIQUE INDEX "Sense_sourceKey_key" ON "Sense"("sourceKey");
