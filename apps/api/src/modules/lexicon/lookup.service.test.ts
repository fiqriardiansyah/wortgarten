import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient, type Gender, type PartOfSpeech } from '@wortgarten/database';
import { foldForLookup } from '@wortgarten/shared';
import type { PrismaService } from '../../prisma/prisma.service';
import { LookupService } from './lookup.service';

// Isolated language tag so this suite's fixtures never collide with the real
// 'de' dictionary or with other test files hitting the same Postgres instance.
const LANG = 'de-lexicon-fixture';

const prisma = new PrismaClient();
const lookupService = new LookupService(prisma as unknown as PrismaService);

const lexemeIds: string[] = [];
let testUserId: string;
let lakeSenseId: string;

interface FormSeed {
  surface: string;
  features?: Record<string, unknown>;
}

async function createLexeme(params: {
  lemma: string;
  partOfSpeech: PartOfSpeech;
  gender?: Gender;
  separablePrefix?: string;
  senses: string[];
  forms: FormSeed[];
}) {
  const lexeme = await prisma.lexeme.create({
    data: {
      language: LANG,
      lemma: params.lemma,
      partOfSpeech: params.partOfSpeech,
      gender: params.gender,
      separablePrefix: params.separablePrefix,
      senses: { create: params.senses.map((translation) => ({ translation })) },
      forms: {
        create: params.forms.map((f) => ({
          surface: f.surface,
          normalized: foldForLookup(f.surface),
          features: f.features,
        })),
      },
    },
    include: { senses: true },
  });
  lexemeIds.push(lexeme.id);
  return lexeme;
}

beforeAll(async () => {
  await createLexeme({
    lemma: 'kommen',
    partOfSpeech: 'VERB',
    senses: ['to come'],
    forms: [{ surface: 'komme' }, { surface: 'kommst' }, { surface: 'kommt' }, { surface: 'kommen' }],
  });

  await createLexeme({
    lemma: 'Hund',
    partOfSpeech: 'NOUN',
    gender: 'MASCULINE',
    senses: ['dog'],
    forms: [{ surface: 'Hund' }, { surface: 'Hunde' }, { surface: 'Hundes' }, { surface: 'Hunden' }],
  });

  await createLexeme({
    lemma: 'schnell',
    partOfSpeech: 'ADJECTIVE',
    senses: ['fast'],
    forms: [{ surface: 'schnell' }, { surface: 'schnelle' }, { surface: 'schneller' }, { surface: 'schnellste' }],
  });

  await createLexeme({
    lemma: 'anrufen',
    partOfSpeech: 'VERB',
    separablePrefix: 'an',
    senses: ['to call (phone)'],
    forms: [
      { surface: 'anrufen' },
      { surface: 'rufe' },
      { surface: 'rufst' },
      { surface: 'ruft' },
      { surface: 'angerufen' },
    ],
  });

  await createLexeme({
    lemma: 'Bank',
    partOfSpeech: 'NOUN',
    gender: 'FEMININE',
    senses: ['bench', 'financial bank'],
    forms: [{ surface: 'Bank' }, { surface: 'Bänke' }],
  });

  const derSee = await createLexeme({
    lemma: 'See',
    partOfSpeech: 'NOUN',
    gender: 'MASCULINE',
    senses: ['lake'],
    forms: [{ surface: 'See' }, { surface: 'Seen' }],
  });
  lakeSenseId = derSee.senses[0].id;

  await createLexeme({
    lemma: 'See',
    partOfSpeech: 'NOUN',
    gender: 'FEMININE',
    senses: ['sea'],
    forms: [{ surface: 'See' }],
  });

  const user = await prisma.user.create({
    data: { name: 'Lexicon Test', email: `lexicon-test-${Date.now()}@example.com` },
  });
  testUserId = user.id;
});

afterAll(async () => {
  await prisma.userWord.deleteMany({ where: { userId: testUserId } });
  await prisma.user.delete({ where: { id: testUserId } });
  await prisma.lexeme.deleteMany({ where: { id: { in: lexemeIds } } }); // cascades senses + forms
  await prisma.$disconnect();
});

describe('LookupService.lookupForm', () => {
  it('kommt → kommen', async () => {
    const matches = await lookupService.lookupForm('kommt', LANG);
    expect(matches.map((m) => m.lexeme.lemma)).toEqual(['kommen']);
  });

  it('Hunde → Hund', async () => {
    const matches = await lookupService.lookupForm('Hunde', LANG);
    expect(matches.map((m) => m.lexeme.lemma)).toEqual(['Hund']);
  });

  it('schnelle → schnell (adjective in "Der schnelle Hund")', async () => {
    const matches = await lookupService.lookupForm('schnelle', LANG);
    expect(matches.map((m) => m.lexeme.lemma)).toEqual(['schnell']);
  });

  it('Bank → two senses on one lexeme', async () => {
    const matches = await lookupService.lookupForm('Bank', LANG);
    expect(matches).toHaveLength(1);
    expect(matches[0].senses.map((s) => s.translation).sort()).toEqual(['bench', 'financial bank']);
  });

  it('See → two lexemes (different genders)', async () => {
    const matches = await lookupService.lookupForm('See', LANG);
    expect(matches).toHaveLength(2);
    expect(matches.map((m) => m.lexeme.gender).sort()).toEqual(['FEMININE', 'MASCULINE']);
  });

  it('unknown surface returns no matches', async () => {
    const matches = await lookupService.lookupForm('gibberischwort', LANG);
    expect(matches).toEqual([]);
  });

  it('folds umlaut typos to still hit the correctly-spelled stored form', async () => {
    // "Hünde" is a typo (real plural has no umlaut) but should still resolve,
    // since normalized is folded on both write and read.
    const matches = await lookupService.lookupForm('Hünde', LANG);
    expect(matches.map((m) => m.lexeme.lemma)).toEqual(['Hund']);
  });

  it('is case-insensitive via folding', async () => {
    const matches = await lookupService.lookupForm('KOMMT', LANG);
    expect(matches.map((m) => m.lexeme.lemma)).toEqual(['kommen']);
  });
});

describe('LookupService.lookupSentence', () => {
  it('"Ich rufe dich an." → anrufen as a single match, not rufen + an', async () => {
    const results = await lookupService.lookupSentence('Ich rufe dich an.', LANG);

    const merged = results.find((r) => r.tokens.length === 2);
    expect(merged).toBeDefined();
    expect(merged!.tokens).toEqual(['rufe', 'an']);
    expect(merged!.matches).toHaveLength(1);
    expect(merged!.matches[0].lexeme.lemma).toBe('anrufen');

    // "an" must not also appear as its own standalone slot
    const standaloneAn = results.find((r) => r.tokens.length === 1 && r.tokens[0] === 'an');
    expect(standaloneAn).toBeUndefined();

    // total slots: Ich, [rufe an], dich = 3
    expect(results).toHaveLength(3);
  });
});

describe('LookupService.disambiguate', () => {
  it('prefers the lexeme the user already has in their word bank', async () => {
    await prisma.userWord.create({
      data: { userId: testUserId, senseId: lakeSenseId },
    });

    const matches = await lookupService.lookupForm('See', LANG);
    const preferred = await lookupService.disambiguate(matches, testUserId);

    expect(preferred).toHaveLength(1);
    expect(preferred[0].lexeme.gender).toBe('MASCULINE');
  });

  it('returns all candidates when nothing is owned yet', async () => {
    const matches = await lookupService.lookupForm('Bank', LANG);
    // single-match case is trivially returned as-is
    const result = await lookupService.disambiguate(matches, testUserId);
    expect(result).toEqual(matches);
  });
});
