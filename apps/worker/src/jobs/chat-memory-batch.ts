import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AiService, generateMemoryNoteForConversation, PrismaService } from '@wortgarten/ai';
import { WorkerModule } from '../worker.module';

// Guardrail against a pathological backlog eating the whole night — same discipline as
// STORY_BATCH_MAX (see story-batch.ts). Each CHAT_MEMORY run is one AI call per conversation, so
// this bounds tonight's spend/runtime, not "how many conversations exist."
const CHAT_MEMORY_BATCH_MAX = Number(process.env.CHAT_MEMORY_BATCH_MAX ?? 500);

async function main() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  const aiService = app.get(AiService);
  const prisma = app.get(PrismaService);

  // A cheap SQL pre-filter, not authoritative (same pattern as story-batch.ts's own candidate
  // query): a conversation with no note yet, or whose note is older than its newest message, MAY
  // have new bubbles to fold in. generateMemoryNoteForConversation re-checks precisely (by
  // message id, not by timestamp) and skips as a no-op if there's nothing new after all.
  const candidates = await prisma.$queryRaw<{ id: string }[]>`
    SELECT c.id FROM "Conversation" c
    LEFT JOIN "MemoryNote" m ON m."conversationId" = c.id
    WHERE m.id IS NULL OR m."updatedAt" < c."lastMessageAt"
    ORDER BY c."lastMessageAt" DESC
    LIMIT ${CHAT_MEMORY_BATCH_MAX}
  `;

  let written = 0;
  let skipped = 0;

  for (const { id: conversationId } of candidates) {
    const result = await generateMemoryNoteForConversation(prisma, aiService, conversationId);
    if (result.status === 'written') {
      written++;
      console.log(`[chat:memory-batch] wrote note for conversation ${conversationId}`);
    } else {
      skipped++;
      console.log(`[chat:memory-batch] skipped conversation ${conversationId}: ${result.reason}`);
    }
  }

  console.log(`[chat:memory-batch] done — candidates=${candidates.length} written=${written} skipped=${skipped}`);

  await app.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('[chat:memory-batch] crashed:', err);
  process.exit(1);
});
