-- CreateEnum
CREATE TYPE "ExampleSource" AS ENUM ('WIKTIONARY', 'TATOEBA', 'AI', 'USER');

-- AlterTable
ALTER TABLE "Sense" ADD COLUMN     "primaryExampleId" TEXT;

-- CreateTable
CREATE TABLE "Example" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "translation" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "tokenCount" INTEGER NOT NULL,
    "source" "ExampleSource" NOT NULL,
    "sourceRef" TEXT,
    "isWellFormed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Example_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExampleWord" (
    "exampleId" TEXT NOT NULL,
    "lexemeId" TEXT NOT NULL,
    "senseId" TEXT,
    "position" INTEGER NOT NULL,
    "surface" TEXT NOT NULL,
    "isUsableForTiles" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ExampleWord_pkey" PRIMARY KEY ("exampleId","lexemeId","position")
);

-- CreateIndex
CREATE UNIQUE INDEX "Example_normalized_key" ON "Example"("normalized");

-- CreateIndex
CREATE INDEX "Example_isWellFormed_tokenCount_idx" ON "Example"("isWellFormed", "tokenCount");

-- CreateIndex
CREATE INDEX "ExampleWord_lexemeId_isUsableForTiles_idx" ON "ExampleWord"("lexemeId", "isUsableForTiles");

-- CreateIndex
CREATE INDEX "ExampleWord_senseId_isUsableForTiles_idx" ON "ExampleWord"("senseId", "isUsableForTiles");

-- AddForeignKey
ALTER TABLE "Sense" ADD CONSTRAINT "Sense_primaryExampleId_fkey" FOREIGN KEY ("primaryExampleId") REFERENCES "Example"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExampleWord" ADD CONSTRAINT "ExampleWord_exampleId_fkey" FOREIGN KEY ("exampleId") REFERENCES "Example"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExampleWord" ADD CONSTRAINT "ExampleWord_lexemeId_fkey" FOREIGN KEY ("lexemeId") REFERENCES "Lexeme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExampleWord" ADD CONSTRAINT "ExampleWord_senseId_fkey" FOREIGN KEY ("senseId") REFERENCES "Sense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

