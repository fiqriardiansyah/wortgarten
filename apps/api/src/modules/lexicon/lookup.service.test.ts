import { randomUUID } from 'crypto';
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
      id: randomUUID(),
      sourceKey: randomUUID(),
      language: LANG,
      lemma: params.lemma,
      partOfSpeech: params.partOfSpeech,
      gender: params.gender,
      separablePrefix: params.separablePrefix,
      senses: { create: params.senses.map((translation) => ({ id: randomUUID(), sourceKey: randomUUID(), translation })) },
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
    lemma: 'aufrufen',
    partOfSpeech: 'VERB',
    separablePrefix: 'auf',
    senses: ['to call up'],
    // shares the "rufe" bare stem with anrufen above — deliberately ambiguous.
    forms: [{ surface: 'aufrufen' }, { surface: 'rufe' }],
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

  // The "heute → heuen" bug fixture: "heute" is both the adverb's own lemma AND the ich/er
  // simple-past form of the weak verb "heuen" (to make hay) — both matches are real, only ranking
  // decides which wins.
  await createLexeme({
    lemma: 'heute',
    partOfSpeech: 'ADVERB',
    senses: ['today'],
    forms: [{ surface: 'heute' }],
  });
  await createLexeme({
    lemma: 'heuen',
    partOfSpeech: 'VERB',
    senses: ['to make hay'],
    forms: [{ surface: 'heuen' }, { surface: 'heue' }, { surface: 'heust' }, { surface: 'heut' }, { surface: 'heute' }],
  });

  // Casing fixture: "park" (lowercase) is the imperative of "parken"; "Park" (capitalized) is the
  // noun. Same normalized surface, genuinely different readings.
  await createLexeme({
    lemma: 'Park',
    partOfSpeech: 'NOUN',
    gender: 'MASCULINE',
    senses: ['park (green space)'],
    forms: [{ surface: 'Park' }, { surface: 'Parks' }],
  });
  await createLexeme({
    lemma: 'parken',
    partOfSpeech: 'VERB',
    senses: ['to park'],
    forms: [{ surface: 'parken' }, { surface: 'parke' }, { surface: 'parkst' }, { surface: 'parkt' }, { surface: 'park' }],
  });

  // Contraction fixture: "im" must resolve to this lexeme, never be collectable as its own form.
  await createLexeme({
    lemma: 'in',
    partOfSpeech: 'PREPOSITION',
    senses: ['in; into'],
    forms: [{ surface: 'in' }],
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

  it('heute → resolves to the adverb "today", never "heuen" (to make hay) despite both being real matches', async () => {
    const matches = await lookupService.lookupForm('heute', LANG);
    expect(matches[0].lexeme.lemma).toBe('heute');
    expect(matches[0].lexeme.partOfSpeech).toBe('ADVERB');
  });

  it('Heute at sentence start still resolves to the adverb — capitalization there carries no signal', async () => {
    const matches = await lookupService.lookupForm('Heute', LANG, true);
    expect(matches[0].lexeme.lemma).toBe('heute');
  });

  it('park (lowercase, mid-sentence) is penalized away from the noun "der Park"', async () => {
    const matches = await lookupService.lookupForm('park', LANG, false);
    expect(matches[0].lexeme.partOfSpeech).not.toBe('NOUN');
    expect(matches[0].lexeme.lemma).toBe('parken');
  });

  it('Park (capitalized, mid-sentence) resolves to the noun', async () => {
    const matches = await lookupService.lookupForm('Park', LANG, false);
    expect(matches[0].lexeme.partOfSpeech).toBe('NOUN');
    expect(matches[0].lexeme.lemma).toBe('Park');
  });

  it('im resolves to its base preposition "in" — never collectable as "im"', async () => {
    const matches = await lookupService.lookupForm('im', LANG);
    expect(matches).toHaveLength(1);
    expect(matches[0].lexeme.lemma).toBe('in');
    expect(matches[0].lexeme.partOfSpeech).toBe('PREPOSITION');
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

  it('an ambiguous bare stem shared by two separable verbs resolves to the first prefix it meets, without losing later tokens', async () => {
    // "rufe" matches both anrufen (prefix "an") and aufrufen (prefix "auf").
    // "an" resolves it first; the later, unrelated "auf" must not clobber that
    // already-resolved slot and orphan "an" out of the results.
    const results = await lookupService.lookupSentence(['rufe', 'dich', 'an', 'sitze', 'auf'], LANG);

    const rufeSlot = results.find((r) => r.tokens[0] === 'rufe');
    expect(rufeSlot?.tokens).toEqual(['rufe', 'an']);
    expect(rufeSlot?.matches).toHaveLength(1);
    expect(rufeSlot?.matches[0].lexeme.lemma).toBe('anrufen');

    const aufSlot = results.find((r) => r.tokens.length === 1 && r.tokens[0] === 'auf');
    expect(aufSlot).toBeDefined(); // gets its own slot rather than being swallowed by the resolved "rufe" slot
    expect(aufSlot?.unknown).toBe(true); // "auf" itself was never seeded as its own WordForm in this fixture

    // every one of the 5 input tokens is accounted for in exactly one slot
    const coveredIndices = results.flatMap((r) => r.tokenIndices).sort((a, b) => a - b);
    expect(coveredIndices).toEqual([0, 1, 2, 3, 4]);
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
