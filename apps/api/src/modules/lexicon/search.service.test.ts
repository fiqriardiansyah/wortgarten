import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@wortgarten/database';
import { foldForLookup } from '@wortgarten/shared';
import type { PrismaService } from '../../prisma/prisma.service';
import { SearchService } from './search.service';

const LANG = 'de-search-fixture';

const prisma = new PrismaClient();
const searchService = new SearchService(prisma as unknown as PrismaService);

const lexemeIds: string[] = [];
let userId: string;
let bankSenseId: string;

async function createLexeme(params: {
  lemma: string;
  partOfSpeech: 'NOUN' | 'VERB' | 'PREPOSITION';
  gender?: 'MASCULINE' | 'FEMININE' | 'NEUTER';
  frequencyRank?: number;
  senses: string[];
  forms: string[];
}) {
  const lexeme = await prisma.lexeme.create({
    data: {
      language: LANG,
      lemma: params.lemma,
      partOfSpeech: params.partOfSpeech,
      gender: params.gender,
      frequencyRank: params.frequencyRank,
      senses: { create: params.senses.map((translation) => ({ translation })) },
      forms: { create: params.forms.map((surface) => ({ surface, normalized: foldForLookup(surface) })) },
    },
    include: { senses: true },
  });
  lexemeIds.push(lexeme.id);
  return lexeme;
}

beforeAll(async () => {
  await createLexeme({
    lemma: 'Hund',
    partOfSpeech: 'NOUN',
    gender: 'MASCULINE',
    frequencyRank: 50,
    senses: ['dog'],
    forms: ['Hund', 'Hunde', 'Hundes', 'Hunden'],
  });

  const kommen = await createLexeme({
    lemma: 'kommen',
    partOfSpeech: 'VERB',
    frequencyRank: 5,
    senses: ['to come'],
    forms: ['komme', 'kommst', 'kommt', 'kommen'],
  });
  bankSenseId = kommen.senses[0].id;

  await createLexeme({
    lemma: 'für',
    partOfSpeech: 'PREPOSITION',
    frequencyRank: 20,
    senses: ['for'],
    forms: ['für'],
  });

  await createLexeme({
    lemma: 'Hundehütte', // shares a substring with "Hund" but is a much rarer, unrelated word
    partOfSpeech: 'NOUN',
    gender: 'FEMININE',
    frequencyRank: 4000,
    senses: ['doghouse'],
    forms: ['Hundehütte'],
  });

  const user = await prisma.user.create({
    data: { name: 'Search Test', email: `search-test-${Date.now()}@example.com` },
  });
  userId = user.id;
});

afterAll(async () => {
  await prisma.userWord.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
  await prisma.lexeme.deleteMany({ where: { id: { in: lexemeIds } } });
  await prisma.$disconnect();
});

describe('SearchService.search', () => {
  it('finds "der Hund" by its own lemma', async () => {
    const results = await searchService.search('Hund', userId, LANG);
    expect(results.map((r) => r.lexeme.lemma)).toContain('Hund');
  });

  it('finds "der Hund" by its English translation ("dog")', async () => {
    const results = await searchService.search('dog', userId, LANG);
    // "Hundehütte" (doghouse) legitimately substring-matches too — forgiving search, not a bug.
    expect(results.map((r) => r.lexeme.lemma)).toContain('Hund');
  });

  it('is umlaut-insensitive: "fur" finds "für"', async () => {
    const results = await searchService.search('fur', userId, LANG);
    expect(results.map((r) => r.lexeme.lemma)).toContain('für');
  });

  it('matches inflected forms: "kommst" finds "kommen"', async () => {
    const results = await searchService.search('kommst', userId, LANG);
    expect(results.map((r) => r.lexeme.lemma)).toContain('kommen');
  });

  it('orders results by frequencyRank ascending (common words first)', async () => {
    const results = await searchService.search('Hund', userId, LANG);
    const ranks = results.map((r) => r.lexeme.frequencyRank);
    expect(ranks).toEqual([...ranks].sort((a, b) => (a ?? Infinity) - (b ?? Infinity)));
    expect(results[0].lexeme.lemma).toBe('Hund'); // rank 50, beats Hundehütte's rank 4000
  });

  it('flags a sense as inBank once the user has collected it', async () => {
    await prisma.userWord.create({ data: { userId, senseId: bankSenseId } });
    const results = await searchService.search('kommen', userId, LANG);
    const kommenResult = results.find((r) => r.lexeme.lemma === 'kommen');
    expect(kommenResult?.senses[0].inBank).toBe(true);
  });

  it('returns an empty array for a blank query', async () => {
    expect(await searchService.search('   ', userId, LANG)).toEqual([]);
  });
});
