import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@wortgarten/database';
import { foldForLookup } from '@wortgarten/shared';
import type { AiJob, AiRawResult } from '@wortgarten/shared';
import { LexemeResolver } from '../story/lexeme-resolver';
import { createCheckChatTurn } from './chat-checker';

const LANG = 'de-chat-checker-fixture';

const prisma = new PrismaClient();
const lexemeIds: string[] = [];

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

let der: Awaited<ReturnType<typeof createLexeme>>;
let hund: Awaited<ReturnType<typeof createLexeme>>;
let laeuft: Awaited<ReturnType<typeof createLexeme>>;

beforeAll(async () => {
  der = await createLexeme({ lemma: 'der', partOfSpeech: 'ARTICLE', forms: ['Der', 'der'] });
  hund = await createLexeme({ lemma: 'Hund', partOfSpeech: 'NOUN', forms: ['Hund'] });
  laeuft = await createLexeme({ lemma: 'laufen', partOfSpeech: 'VERB', forms: ['läuft'] });
});

afterAll(async () => {
  await prisma.lexeme.deleteMany({ where: { id: { in: lexemeIds } } });
  await prisma.$disconnect();
});

function job(minCoveragePct = 80): AiJob {
  return {
    type: 'CHAT_TURN',
    allowedWords: ['der', 'Hund', 'laufen'],
    maxWords: 40,
    meta: {
      allowlistIds: [der.id, hund.id, laeuft.id],
      knownLexemeIds: [hund.id, laeuft.id],
      knownSenseByLexeme: { [hund.id]: hund.senses[0].id, [laeuft.id]: laeuft.senses[0].id },
      minCoveragePct,
      language: LANG,
    },
  };
}

function raw(json: unknown): AiRawResult {
  return { provider: 'GROQ', json, raw: JSON.stringify(json) };
}

describe('createCheckChatTurn', () => {
  const resolver = new LexemeResolver(prisma);
  const checkChatTurn = createCheckChatTurn(resolver);

  it('accepts a reply fully inside the allowlist, resolving tokens/glossary and 100% coverage', async () => {
    const result = await checkChatTurn(raw({ reply: 'Der Hund läuft.', translation: 'The dog runs.' }), job());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.coverageKnownPct).toBe(100);
    expect(result.value.translation).toBe('The dog runs.');
    const hundToken = result.value.tokens.find((t) => t.text === 'Hund');
    expect(hundToken).toMatchObject({ lexemeId: hund.id, status: 'known' });
    expect(result.value.glossary[hund.id]).toMatchObject({ lexemeId: hund.id, translation: 'Hund-translation' });
  });

  it('rejects a reply whose coverage falls below minCoveragePct as TOO_HARD, never OLLAMA-flavored', async () => {
    const result = await checkChatTurn(raw({ reply: 'Der Wolkenkratzer explodiert spektakulär.' }), job(80));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('TOO_HARD');
  });

  it('accepts the same low-coverage reply once minCoveragePct is low enough', async () => {
    const result = await checkChatTurn(raw({ reply: 'Der Wolkenkratzer explodiert spektakulär.' }), job(0));
    expect(result.ok).toBe(true);
  });

  it('rejects malformed JSON', async () => {
    const result = await checkChatTurn({ provider: 'GROQ', json: null, raw: 'not json' }, job());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('BAD_JSON');
  });

  it('rejects a blank reply', async () => {
    const result = await checkChatTurn(raw({ reply: '   ' }), job());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('EMPTY');
  });

  it('keeps a suggestedReply that clears the same coverage floor as the reply itself', async () => {
    const result = await checkChatTurn(raw({ reply: 'Der Hund läuft.', suggestedReplies: ['Der Hund läuft.'] }), job());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.suggestedReplies).toEqual(['Der Hund läuft.']);
  });

  it('drops a suggestedReply that falls below minCoveragePct without rejecting the turn itself', async () => {
    const result = await checkChatTurn(raw({ reply: 'Der Hund läuft.', suggestedReplies: ['Der Wolkenkratzer explodiert spektakulär.'] }), job());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.suggestedReplies).toEqual([]);
  });

  it('returns an empty suggestedReplies array when the model omits the field entirely', async () => {
    const result = await checkChatTurn(raw({ reply: 'Der Hund läuft.' }), job());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.suggestedReplies).toEqual([]);
  });
});
