-- CreateTable
CREATE TABLE "MemoryNote" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "factsJson" JSONB NOT NULL DEFAULT '[]',
    "lastMessageId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemoryNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MemoryNote_conversationId_key" ON "MemoryNote"("conversationId");

-- AddForeignKey
ALTER TABLE "MemoryNote" ADD CONSTRAINT "MemoryNote_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
