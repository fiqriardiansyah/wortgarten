import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient, type PartOfSpeech, type WordLevel } from '@wortgarten/database';
import { MIN_KNOWN_WORDS_FOR_STORY, selectStoryVocabulary } from './select-vocabulary';

// Isolated language tag so this suite's fixtures never collide with the real 'de' dictionary or
// with other test files hitting the same Postgres instance — same convention as
// apps/api's lookup.service.test.ts.
const LANG = 'de-story-vocab-fixture';

const prisma = new PrismaClient();
const lexemeIds: string[] = [];
let userId: string;

async function createLexeme(lemma: string, partOfSpeech: PartOfSpeech, frequencyRank: number | null) {
  const lexeme = await prisma.lexeme.create({
    data: {
      id: randomUUID(),
      sourceKey: randomUUID(),
      language: LANG,
      lemma,
      partOfSpeech,
      frequencyRank,
      senses: { create: [{ id: randomUUID(), sourceKey: randomUUID(), translation: `${lemma}-translation` }] },
    },
    include: { senses: true },
  });
  lexemeIds.push(lexeme.id);
  return lexeme;
}

async function addToBank(senseId: string, level: WordLevel) {
  await prisma.userWord.create({ data: { userId, senseId, level, dueAt: new Date() } });
}

beforeAll(async () => {
  const user = await prisma.user.create({ data: { name: 'Story Vocab Test', email: `story-vocab-test-${Date.now()}@example.com` } });
  userId = user.id;
});

afterAll(async () => {
  await prisma.userWord.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
  await prisma.lexeme.deleteMany({ where: { id: { in: lexemeIds } } }); // cascades senses
  await prisma.$disconnect();
});

describe('selectStoryVocabulary', () => {
  it('returns null when the user has fewer than MIN_KNOWN_WORDS_FOR_STORY known words', async () => {
    for (let i = 0; i < MIN_KNOWN_WORDS_FOR_STORY - 1; i++) {
      const lexeme = await createLexeme(`toofew-${i}`, 'NOUN', null);
      await addToBank(lexeme.senses[0].id, 'RECOGNIZE');
    }

    const vocab = await selectStoryVocabulary(prisma, userId, LANG);
    expect(vocab).toBeNull();
  });

  it('selects known (>=RECOGNIZE) + function (rank<=200) + new words, excluding bank words at any level', async () => {
    // Top up known words past the floor (the previous test already added MIN-1).
    for (let i = 0; i < 5; i++) {
      const lexeme = await createLexeme(`known-${i}`, 'VERB', null);
      await addToBank(lexeme.senses[0].id, 'RECOGNIZE');
    }
    // A bank word at NEW — must count as "in the bank" (excluded from new-word candidates) but
    // must NOT count as "known" (excluded from knownLexemeIds).
    const newLevelLexeme = await createLexeme('bank-at-new-level', 'NOUN', 250);
    await addToBank(newLevelLexeme.senses[0].id, 'NEW');

    const function1 = await createLexeme('der', 'ARTICLE', 1);
    const function2 = await createLexeme('und', 'CONJUNCTION', 2);

    const newWordLow = await createLexeme('neugierig', 'ADJECTIVE', 300);
    const newWordMid = await createLexeme('freude', 'NOUN', 301);
    const newWordHigh = await createLexeme('unreachable', 'NOUN', 302);

    const vocab = await selectStoryVocabulary(prisma, userId, LANG);

    expect(vocab).not.toBeNull();
    if (!vocab) return;

    expect(vocab.knownLexemeIds.has(newLevelLexeme.id)).toBe(false);
    expect(vocab.knownLexemeIds.size).toBeGreaterThanOrEqual(MIN_KNOWN_WORDS_FOR_STORY);

    expect(vocab.functionLexemeIds.has(function1.id)).toBe(true);
    expect(vocab.functionLexemeIds.has(function2.id)).toBe(true);

    // Only the top 2 unexcluded candidates by ascending frequencyRank, never the bank-at-NEW one
    // even though its rank (250) would otherwise qualify.
    expect(vocab.newWords.map((w) => w.lexemeId)).toEqual([newWordLow.id, newWordMid.id]);
    expect(vocab.newWords.some((w) => w.lexemeId === newLevelLexeme.id)).toBe(false);
    expect(vocab.newWords.some((w) => w.lexemeId === newWordHigh.id)).toBe(false);

    expect(vocab.allowlistIds.has(function1.id)).toBe(true);
    expect(vocab.allowlistIds.has(newWordLow.id)).toBe(true);
    expect(vocab.allowlistIds.has(newLevelLexeme.id)).toBe(false); // NEW level, not RECOGNIZE+, not function, not picked as new
  });
});
