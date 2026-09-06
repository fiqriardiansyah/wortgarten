import type { Prisma, PrismaClient } from '@wortgarten/database';
import type { MemoryFact } from '@wortgarten/shared';
import type { AiService } from '../ai.service';
import type { ChatTurnHistoryEntry } from './chat-job';
import { buildMemoryJob } from './memory-job';
import type { CheckedMemoryNote } from './memory-checker';

// A missed night (or several) is harmless per the spec, but an unbounded backlog would still make
// a single prompt huge — cap how many new bubbles one run folds in. Bubbles beyond this are
// simply never individually summarized (a documented, accepted loss for a pathological gap, not
// something the daily-turn-limited product ever produces in practice).
const MAX_NEW_BUBBLES = 200;

export type MemoryNoteResult = { status: 'written'; conversationId: string } | { status: 'skipped'; reason: string };

/**
 * The night path for ONE conversation's MemoryNote — gather old summary/facts + new bubbles since
 * `lastMessageId`, run them through the AiService spine (Ollama allowed here; this must never be
 * called from the daytime request path), and store the result. On any failure — no new messages,
 * the AI call exhausting retries/fallback, or a malformed draft — the OLD note is left untouched
 * and this is reported as `skipped`, never thrown; a caller (the worker batch job) just moves on
 * to the next conversation. See the iteration 5 spec's "never blocks the next day's chat" rule.
 */
export async function generateMemoryNoteForConversation(
  prisma: PrismaClient,
  aiService: AiService,
  conversationId: string,
  language = 'de',
): Promise<MemoryNoteResult> {
  const [existing, messages] = await Promise.all([
    prisma.memoryNote.findUnique({ where: { conversationId } }),
    prisma.message.findMany({ where: { conversationId }, orderBy: { createdAt: 'asc' }, select: { id: true, sender: true, text: true } }),
  ]);

  // `lastMessageId` marks a position in this same ordered list — slice everything after it
  // (or everything, on a first run / after "Forget this" reset lastMessageId to null).
  const lastIndex = existing?.lastMessageId ? messages.findIndex((m) => m.id === existing.lastMessageId) : -1;
  const newMessages = (lastIndex >= 0 ? messages.slice(lastIndex + 1) : messages).slice(-MAX_NEW_BUBBLES);

  if (newMessages.length === 0) {
    return { status: 'skipped', reason: 'no_new_messages' };
  }

  const oldFacts = (existing?.factsJson as unknown as MemoryFact[] | null) ?? [];
  const newBubbles: ChatTurnHistoryEntry[] = newMessages.map((m) => ({ role: m.sender as 'user' | 'character', text: m.text }));

  const job = buildMemoryJob(existing?.summary ?? '', oldFacts.map((f) => f.text), newBubbles, language);
  // No `remoteOnly` — this is the night path, the one place CHAT_MEMORY may fall through to
  // OLLAMA. Never call this from apps/api's request handlers.
  const result = await aiService.run(job);
  if (!result.ok) {
    return { status: 'skipped', reason: `ai_failed_${result.reason}` };
  }

  const value = result.value as CheckedMemoryNote;
  const priorAddedAtByText = new Map(oldFacts.map((f) => [f.text, f.addedAt]));
  const nowIso = new Date().toISOString();
  // Carried-forward facts keep their original `addedAt`; only a genuinely new fact text is
  // stamped with today's date — otherwise every fact would read as "added today," every night.
  const facts: MemoryFact[] = value.facts.map((text) => ({ text, addedAt: priorAddedAtByText.get(text) ?? nowIso }));
  const lastMessageId = newMessages[newMessages.length - 1].id;

  await prisma.memoryNote.upsert({
    where: { conversationId },
    create: { conversationId, summary: value.summary, factsJson: facts as unknown as Prisma.InputJsonValue, lastMessageId },
    update: { summary: value.summary, factsJson: facts as unknown as Prisma.InputJsonValue, lastMessageId, updatedAt: new Date() },
  });

  return { status: 'written', conversationId };
}
