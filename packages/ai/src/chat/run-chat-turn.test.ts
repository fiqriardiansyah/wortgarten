import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@wortgarten/database';
import { foldForLookup } from '@wortgarten/shared';
import type { AiRouterPort } from '../ai-router';
import { AiService } from '../ai.service';
import { FakeAdapter } from '../adapters/fake.adapter';
import { LexemeResolver } from '../story/lexeme-resolver';
import { checkStoryDraft } from '../story/story-checker';
import { createCheckChatTurn } from './chat-checker';
import { runChatTurn } from './run-chat-turn';

const LANG = 'de-run-chat-turn-fixture';
const prisma = new PrismaClient();
const lexemeIds: string[] = [];
const fakeRouter: AiRouterPort = { decide: async () => 'GROQ', recordGroqSuccess: async () => {} };

async function createLexeme(params: { lemma: string; partOfSpeech: 'NOUN' | 'ARTICLE' | 'VERB'; forms: string[] }) {
  const lexeme = await prisma.lexeme.create({
    data: {
      id: randomUUID(),
      sourceKey: randomUUID(),
      language: LANG,
      lemma: params.lemma,
      partOfSpeech: params.partOfSpeech,
      senses: { create: [{ id: randomUUID(), sourceKey: randomUUID(), translation: `${params.lemma}-translation` }] },
      forms: { create: params.forms.map((surface) => ({ surface, normalized: foldForLookup(surface) })) },
    },
    include: { senses: true },
  });
  lexemeIds.push(lexeme.id);
  return lexeme;
}

let userId: string;

beforeAll(async () => {
  const der = await createLexeme({ lemma: 'der', partOfSpeech: 'ARTICLE', forms: ['Der', 'der'] });
  const hund = await createLexeme({ lemma: 'Hund', partOfSpeech: 'NOUN', forms: ['Hund'] });
  const laufen = await createLexeme({ lemma: 'laufen', partOfSpeech: 'VERB', forms: ['läuft'] });

  const user = await prisma.user.create({ data: { name: 'Fixture', email: `run-chat-turn-${randomUUID()}@example.com` } });
  userId = user.id;
  await prisma.userWord.createMany({
    data: [der, hund, laufen].map((l) => ({ userId, senseId: l.senses[0].id, level: 'RECOGNIZE', dueAt: new Date() })),
  });
});

afterAll(async () => {
  await prisma.user.delete({ where: { id: userId } }); // cascades the UserWord rows above
  await prisma.lexeme.deleteMany({ where: { id: { in: lexemeIds } } });
  await prisma.$disconnect();
});

function buildAiService(groqResponses: (string | Record<string, unknown>)[]) {
  const resolver = new LexemeResolver(prisma);
  const groq = new FakeAdapter('GROQ', groqResponses);
  const ollama = new FakeAdapter('OLLAMA', ['{}']);
  const aiService = new AiService(fakeRouter, groq, ollama, 1, checkStoryDraft, createCheckChatTurn(resolver));
  return { aiService, resolver, groq };
}

const persona = { name: 'Tom', role: 'a friendly guide', personaLine: 'Warm and curious.', archetype: 'friendly_host' };

describe('runChatTurn', () => {
  it('SEAM 2: uses the groq turn source when the reply fits the reader\'s vocabulary', async () => {
    const { aiService, resolver } = buildAiService([{ reply: 'Der Hund läuft.', translation: 'The dog runs.', suggestedReplies: ['Der Hund läuft.'] }]);

    const result = await runChatTurn(prisma, aiService, resolver, {
      userId,
      language: LANG,
      persona,
      storyTitle: null,
      history: [],
      userText: 'Hallo!',
      allowGroq: true,
    });

    expect(result.source).toBe('groq');
    expect(result.text).toBe('Der Hund läuft.');
    expect(result.translation).toBe('The dog runs.');
    expect(result.tokens.some((t) => t.text === 'Hund')).toBe(true);
    expect(result.suggestedReplies).toEqual(['Der Hund läuft.']);
  });

  it('SEAM 2: falls back to scripted when every groq attempt is too hard for the reader, never touching Ollama', async () => {
    const { aiService, resolver, groq } = buildAiService([{ reply: 'Der Wolkenkratzer explodiert spektakulär im Universum.' }]);

    const result = await runChatTurn(prisma, aiService, resolver, {
      userId,
      language: LANG,
      persona,
      storyTitle: null,
      history: [],
      userText: 'Hallo!',
      allowGroq: true,
    });

    expect(result.source).toBe('scripted');
    expect(result.text.length).toBeGreaterThan(0);
    // maxRetries=1 -> exactly 2 attempts against GROQ, then remoteOnly gives up rather than
    // falling back to OLLAMA (the whole point of `{ remoteOnly: true }`).
    expect(groq.calls).toBe(2);
  });

  it('SEAM 2: skips the groq path entirely when allowGroq is false (STORY_CHAT_ENABLED off)', async () => {
    const { aiService, resolver, groq } = buildAiService([{ reply: 'Der Hund läuft.' }]);

    const result = await runChatTurn(prisma, aiService, resolver, {
      userId,
      language: LANG,
      persona,
      storyTitle: null,
      history: [],
      userText: 'Hallo!',
      allowGroq: false,
    });

    expect(result.source).toBe('scripted');
    expect(groq.calls).toBe(0);
  });

  it('SEAM 2: suggestedReplies is always empty on the scripted path — no model call to draw from', async () => {
    const { aiService, resolver } = buildAiService([{ reply: 'Der Wolkenkratzer explodiert spektakulär im Universum.' }]);

    const result = await runChatTurn(prisma, aiService, resolver, {
      userId,
      language: LANG,
      persona,
      storyTitle: null,
      history: [],
      userText: 'Hallo!',
      allowGroq: true,
    });

    expect(result.source).toBe('scripted');
    expect(result.suggestedReplies).toEqual([]);
  });
});
