-- AlterTable
ALTER TABLE "Story" ADD COLUMN     "worldKey" TEXT;

-- CreateTable
CREATE TABLE "World" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "requiredCount" INTEGER NOT NULL,

    CONSTRAINT "World_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldWord" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "lexemeId" TEXT NOT NULL,

    CONSTRAINT "WorldWord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserWorldUnlock" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserWorldUnlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "World_key_key" ON "World"("key");

-- CreateIndex
CREATE INDEX "World_key_idx" ON "World"("key");

-- CreateIndex
CREATE INDEX "WorldWord_lexemeId_idx" ON "WorldWord"("lexemeId");

-- CreateIndex
CREATE UNIQUE INDEX "WorldWord_worldId_lexemeId_key" ON "WorldWord"("worldId", "lexemeId");

-- CreateIndex
CREATE INDEX "UserWorldUnlock_userId_idx" ON "UserWorldUnlock"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserWorldUnlock_userId_worldId_key" ON "UserWorldUnlock"("userId", "worldId");

-- AddForeignKey
ALTER TABLE "WorldWord" ADD CONSTRAINT "WorldWord_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldWord" ADD CONSTRAINT "WorldWord_lexemeId_fkey" FOREIGN KEY ("lexemeId") REFERENCES "Lexeme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserWorldUnlock" ADD CONSTRAINT "UserWorldUnlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserWorldUnlock" ADD CONSTRAINT "UserWorldUnlock_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE CASCADE ON UPDATE CASCADE;
