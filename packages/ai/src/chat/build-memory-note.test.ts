import { randomUUID } from 'crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@wortgarten/database';
import type { AiRouterPort } from '../ai-router';
import { AiService } from '../ai.service';
import { FakeAdapter } from '../adapters/fake.adapter';
import { checkMemoryNote } from './memory-checker';
import { generateMemoryNoteForConversation } from './build-memory-note';

const prisma = new PrismaClient();
const fakeRouter: AiRouterPort = { decide: async () => 'GROQ', recordGroqSuccess: async () => {} };

let userId: string;
let characterId: string;

async function createConversationWithMessages(texts: { role: 'user' | 'character'; text: string }[]) {
  const conversation = await prisma.conversation.create({ data: { userId, characterId, lastMessageAt: new Date(), unreadCount: 0 } });
  for (const { role, text } of texts) {
    await prisma.message.create({ data: { conversationId: conversation.id, sender: role, text } });
  }
  return conversation.id;
}

function buildAiService(groqResponses: (string | Record<string, unknown>)[], maxRetries = 1) {
  const groq = new FakeAdapter('GROQ', groqResponses);
  const ollama = new FakeAdapter('OLLAMA', groqResponses);
  const aiService = new AiService(fakeRouter, groq, ollama, maxRetries, undefined, undefined, checkMemoryNote);
  return { aiService, groq, ollama };
}

beforeEach(async () => {
  const user = await prisma.user.create({ data: { name: 'Fixture', email: `build-memory-note-${randomUUID()}@example.com` } });
  userId = user.id;
  const character = await prisma.character.create({
    data: { name: 'Tom', role: 'a friendly guide', personaLine: 'Warm and curious.', archetype: 'friendly_host', levelCapJson: {} },
  });
  characterId = character.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('generateMemoryNoteForConversation', () => {
  it('writes a fresh note from scratch when none exists yet, folding in every message so far', async () => {
    const conversationId = await createConversationWithMessages([
      { role: 'user', text: 'Ich lerne Deutsch für eine Reise.' },
      { role: 'character', text: 'Toll! Wohin fährst du?' },
    ]);
    const { aiService } = buildAiService([{ summary: 'You are learning German for a trip.', facts: ['learning for a trip'] }]);

    const result = await generateMemoryNoteForConversation(prisma, aiService, conversationId, 'de');
    expect(result).toEqual({ status: 'written', conversationId });

    const note = await prisma.memoryNote.findUniqueOrThrow({ where: { conversationId } });
    expect(note.summary).toBe('You are learning German for a trip.');
    expect(note.factsJson).toMatchObject([{ text: 'learning for a trip' }]);
    expect(note.lastMessageId).not.toBeNull();
  });

  it('skips with no_new_messages when nothing has been said since the last run', async () => {
    const conversationId = await createConversationWithMessages([{ role: 'user', text: 'Hallo!' }]);
    const { aiService } = buildAiService([{ summary: 'You said hello.', facts: [] }]);

    await generateMemoryNoteForConversation(prisma, aiService, conversationId, 'de');
    const second = await generateMemoryNoteForConversation(prisma, aiService, conversationId, 'de');

    expect(second).toEqual({ status: 'skipped', reason: 'no_new_messages' });
  });

  it('leaves the old note completely untouched when the AI call fails', async () => {
    const conversationId = await createConversationWithMessages([{ role: 'user', text: 'Hallo!' }]);
    const good = buildAiService([{ summary: 'You said hello.', facts: ['likes greetings'] }]);
    await generateMemoryNoteForConversation(prisma, good.aiService, conversationId, 'de');
    const before = await prisma.memoryNote.findUniqueOrThrow({ where: { conversationId } });

    await prisma.message.create({ data: { conversationId, sender: 'character', text: 'Wie geht es dir?' } });
    const failing = buildAiService(['not valid json', 'still not valid json']);

    const result = await generateMemoryNoteForConversation(prisma, failing.aiService, conversationId, 'de');
    expect(result.status).toBe('skipped');
    if (result.status !== 'skipped') return;
    expect(result.reason).toMatch(/^ai_failed_/);

    const after = await prisma.memoryNote.findUniqueOrThrow({ where: { conversationId } });
    expect(after).toEqual(before);
  });

  it('carries forward an unchanged fact\'s original addedAt across a second nightly run', async () => {
    const conversationId = await createConversationWithMessages([{ role: 'user', text: 'Ich mag Katzen.' }]);
    const first = buildAiService([{ summary: 'You talked about pets.', facts: ['likes cats'] }]);
    await generateMemoryNoteForConversation(prisma, first.aiService, conversationId, 'de');
    const afterFirst = await prisma.memoryNote.findUniqueOrThrow({ where: { conversationId } });
    const originalAddedAt = (afterFirst.factsJson as { text: string; addedAt: string }[])[0].addedAt;

    await prisma.message.create({ data: { conversationId, sender: 'character', text: 'Welche Katzen magst du?' } });
    const second = buildAiService([{ summary: 'You talked more about pets.', facts: ['likes cats', 'has a new favorite story'] }]);
    await generateMemoryNoteForConversation(prisma, second.aiService, conversationId, 'de');

    const afterSecond = await prisma.memoryNote.findUniqueOrThrow({ where: { conversationId } });
    const facts = afterSecond.factsJson as { text: string; addedAt: string }[];
    expect(facts.find((f) => f.text === 'likes cats')?.addedAt).toBe(originalAddedAt);
    expect(facts.find((f) => f.text === 'has a new favorite story')).toBeTruthy();
  });
});
