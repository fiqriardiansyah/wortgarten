import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient, type Gender, type PartOfSpeech } from '@wortgarten/database';
import { foldForLookup } from '@wortgarten/shared';
import type { PrismaService } from '../../prisma/prisma.service';
import { AnalyzeService } from './analyze.service';
import { LookupService } from './lookup.service';

const LANG = 'de-analyze-fixture';

const prisma = new PrismaClient();
const lookupService = new LookupService(prisma as unknown as PrismaService);
const analyzeService = new AnalyzeService(prisma as unknown as PrismaService, lookupService);

const lexemeIds: string[] = [];
let userId: string;
let toComeSenseId: string;
let seinPossessiveSenseId: string;

async function createLexeme(params: {
  lemma: string;
  partOfSpeech: PartOfSpeech;
  gender?: Gender;
  separablePrefix?: string;
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
      separablePrefix: params.separablePrefix,
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
  const kommen = await createLexeme({
    lemma: 'kommen',
    partOfSpeech: 'VERB',
    senses: ['to come'],
    forms: ['komme', 'kommst', 'kommt', 'kommen'],
  });
  toComeSenseId = kommen.senses[0].id;

  await createLexeme({
    lemma: 'anrufen',
    partOfSpeech: 'VERB',
    separablePrefix: 'an',
    senses: ['to call (phone)'],
    forms: ['anrufen', 'rufe', 'rufst', 'ruft'],
  });

  await createLexeme({
    lemma: 'Bank',
    partOfSpeech: 'NOUN',
    gender: 'FEMININE',
    senses: ['bench', 'financial institution'],
    // two WordForm rows folding to the same surface (e.g. two declension-table
    // entries for the same case) — must not duplicate this lexeme's senses.
    forms: ['Bank', 'Bank', 'Bänke'],
  });

  // "ich" resolves to two different lexemes (pronoun vs a rare noun homograph,
  // mirroring the real seed) — ordinary polysemy at the cross-lexeme level:
  // one is overwhelmingly dominant, so this must default to NEW, not AMBIGUOUS.
  await createLexeme({
    lemma: 'ich',
    partOfSpeech: 'PRONOUN',
    frequencyRank: 7,
    senses: ['I'],
    forms: ['ich'],
  });
  await createLexeme({
    lemma: 'Ich',
    partOfSpeech: 'NOUN',
    gender: 'NEUTER',
    frequencyRank: 16,
    senses: ['ego', 'self'],
    forms: ['Ich'],
  });

  // "aus" resolves to four different-POS lexemes in the real dictionary
  // (preposition/adverb/adjective/noun) — same shape here with two. Different
  // POS, so not the "real ambiguity" case; must default to the dominant one
  // (lowest frequencyRank) and stay NEW despite multiple senses on it.
  await createLexeme({
    lemma: 'aus',
    partOfSpeech: 'PREPOSITION',
    frequencyRank: 333,
    senses: ['out of; from', 'from (a place)', 'of; made of'],
    forms: ['aus'],
  });
  await createLexeme({
    lemma: 'aus',
    partOfSpeech: 'ADVERB',
    frequencyRank: 900,
    senses: ['out', 'ago'],
    forms: ['aus'],
  });

  // "See" — real ambiguity: two NOUN lexemes distinguished only by gender
  // (der See = lake, die See = sea). Same POS, must be AMBIGUOUS.
  await createLexeme({
    lemma: 'See',
    partOfSpeech: 'NOUN',
    gender: 'MASCULINE',
    frequencyRank: 3770,
    senses: ['lake'],
    forms: ['See'],
  });
  await createLexeme({
    lemma: 'See',
    partOfSpeech: 'NOUN',
    gender: 'FEMININE',
    frequencyRank: 3817,
    senses: ['sea', 'sea condition'],
    forms: ['See'],
  });

  // The "heute → heuen" bug fixture: "heute" is both the adverb's own lemma AND the ich/er
  // simple-past form of the weak verb "heuen" (to make hay).
  await createLexeme({
    lemma: 'heute',
    partOfSpeech: 'ADVERB',
    senses: ['today'],
    forms: ['heute'],
  });
  await createLexeme({
    lemma: 'heuen',
    partOfSpeech: 'VERB',
    senses: ['to make hay'],
    forms: ['heuen', 'heue', 'heust', 'heut', 'heute'],
  });

  await createLexeme({
    lemma: 'Nachmittag',
    partOfSpeech: 'NOUN',
    gender: 'MASCULINE',
    senses: ['afternoon'],
    forms: ['Nachmittag', 'Nachmittags', 'Nachmittage'],
  });

  // "sein" is two different lexemes — the verb "to be" (war is its simple past) and the
  // possessive pronoun "his" — sharing nothing but spelling. KNOWN must never confuse them.
  await createLexeme({
    lemma: 'sein',
    partOfSpeech: 'VERB',
    senses: ['to be'],
    forms: ['sein', 'bin', 'bist', 'ist', 'war', 'warst', 'waren'],
  });
  const seinPossessive = await createLexeme({
    lemma: 'sein',
    partOfSpeech: 'PRONOUN',
    senses: ['his'],
    forms: ['sein'],
  });
  seinPossessiveSenseId = seinPossessive.senses[0].id;

  await createLexeme({
    lemma: 'in',
    partOfSpeech: 'PREPOSITION',
    senses: ['in; into'],
    forms: ['in'],
  });
  await createLexeme({
    lemma: 'Park',
    partOfSpeech: 'NOUN',
    gender: 'MASCULINE',
    senses: ['park (green space)'],
    forms: ['Park', 'Parks'],
  });

  const user = await prisma.user.create({
    data: { name: 'Analyze Test', email: `analyze-test-${Date.now()}@example.com` },
  });
  userId = user.id;
});

afterAll(async () => {
  await prisma.userWord.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
  await prisma.lexeme.deleteMany({ where: { id: { in: lexemeIds } } });
  await prisma.$disconnect();
});

describe('AnalyzeService.analyze', () => {
  it('resolves an inflected form to its lemma (komme → kommen) and flags a proper noun as unrecognized', async () => {
    const result = await analyzeService.analyze('Ich komme aus London.', userId, LANG);

    const komme = result.tokens.find((t) => t.surface === 'komme');
    expect(komme?.status).toBe('NEW');
    expect(komme?.candidates?.[0].lexeme.lemma).toBe('kommen');
    // never offered as a bare inflected form
    expect(komme?.candidates?.some((c) => c.lexeme.lemma === 'komme')).toBe(false);

    const london = result.tokens.find((t) => t.surface === 'London');
    expect(london?.status).toBe('UNRECOGNIZED');
    expect(london?.candidates).toBeUndefined();
  });

  it('reassembles a separable verb ("rufe" ... "an") into one collectable unit, not two', async () => {
    const result = await analyzeService.analyze('Ich rufe dich an.', userId, LANG);

    const rufe = result.tokens.find((t) => t.surface === 'rufe');
    const an = result.tokens.find((t) => t.surface === 'an');
    const dich = result.tokens.find((t) => t.surface === 'dich');

    expect(rufe?.status).toBe('NEW');
    expect(an?.status).toBe('NEW');
    expect(rufe?.candidates?.[0].lexeme.lemma).toBe('anrufen');
    expect(an?.candidates?.[0].lexeme.lemma).toBe('anrufen');
    expect(rufe?.groupId).toBe(an?.groupId); // one collectable unit
    expect(dich?.groupId).not.toBe(rufe?.groupId); // filler word between them stays separate

    // exactly one NEW "word" counted for the verb (plus "Ich" itself), not two for the verb
    expect(result.summary.new).toBe(2);
  });

  it('flags "Bank" as ambiguous with both senses offered, deduped despite duplicate WordForm rows', async () => {
    const result = await analyzeService.analyze('Ich sitze auf der Bank.', userId, LANG);

    const bank = result.tokens.find((t) => t.surface === 'Bank');
    expect(bank?.status).toBe('AMBIGUOUS');
    expect(bank?.candidates).toHaveLength(2); // not 4 — the duplicate "Bank" WordForm row must not double the senses
    expect(bank?.candidates?.map((c) => c.translation).sort()).toEqual(['bench', 'financial institution']);
  });

  it('ordinary polysemy (ich, aus, komme) is never ambiguous, even across multiple matched lexemes', async () => {
    const result = await analyzeService.analyze('Ich komme aus London.', userId, LANG);

    const ich = result.tokens.find((t) => t.surface === 'Ich');
    expect(ich?.status).toBe('NEW');
    expect(ich?.candidates?.[0].lexeme.lemma).toBe('ich'); // dominant (lowest frequencyRank), not the rare noun homograph

    const aus = result.tokens.find((t) => t.surface === 'aus');
    expect(aus?.status).toBe('NEW');
    expect(aus?.candidates?.[0].lexeme.lemma).toBe('aus');
    expect(aus?.candidates?.[0].lexeme.partOfSpeech).toBe('PREPOSITION'); // dominant sense, not the rarer adverb

    const komme = result.tokens.find((t) => t.surface === 'komme');
    expect(komme?.status).toBe('NEW');

    expect(result.summary).toEqual({ total: 4, known: 0, new: 3, ambiguous: 0, unrecognized: 1 });
  });

  it('flags "See" as ambiguous across two lexemes distinguished only by gender (der See vs die See)', async () => {
    const result = await analyzeService.analyze('Ich sitze am See.', userId, LANG);

    const see = result.tokens.find((t) => t.surface === 'See');
    expect(see?.status).toBe('AMBIGUOUS');
    expect(see?.candidates?.map((c) => c.translation).sort()).toEqual(['lake', 'sea', 'sea condition']);
    // sensible non-blocking default: the more frequent lexeme's first sense
    expect(see?.candidates?.[0].translation).toBe('lake');
  });

  it('marks a token KNOWN once its sense is already in the user’s bank', async () => {
    await prisma.userWord.create({ data: { userId, senseId: toComeSenseId } });

    const result = await analyzeService.analyze('Ich komme.', userId, LANG);
    const komme = result.tokens.find((t) => t.surface === 'komme');

    expect(komme?.status).toBe('KNOWN');
    expect(komme?.knownSenseId).toBe(toComeSenseId);
    expect(result.summary.known).toBe(1);
  });

  it('preserves original character offsets for exact text reconstruction', async () => {
    const text = 'Ich komme aus London.';
    const result = await analyzeService.analyze(text, userId, LANG);
    for (const token of result.tokens) {
      expect(text.slice(token.start, token.end)).toBe(token.surface);
    }
  });

  it('never lets the status buckets disagree with the word count (known + new + ambiguous + unrecognized === total)', async () => {
    for (const text of ['Ich komme aus London.', 'Ich rufe dich an.', 'Ich sitze auf der Bank.', 'Ich sitze am See.']) {
      const result = await analyzeService.analyze(text, userId, LANG);
      const { total, known, new: newCount, ambiguous, unrecognized } = result.summary;
      expect(known + newCount + ambiguous + unrecognized).toBe(total);
    }
  });

  it('KNOWN is decided by senseId, not lemma text: "war" (to be) is NEW for a user who only owns "sein" (his)', async () => {
    await prisma.userWord.create({ data: { userId, senseId: seinPossessiveSenseId } });

    const result = await analyzeService.analyze('war', userId, LANG);
    const war = result.tokens.find((t) => t.surface === 'war');

    expect(war?.status).toBe('NEW');
    expect(war?.candidates?.[0].lexeme.lemma).toBe('sein');
    expect(war?.candidates?.[0].lexeme.partOfSpeech).toBe('VERB');
  });

  it('full sentence end to end: "Heute Nachmittag war ich im Park" — no hay-making, "im" resolves to "in"', async () => {
    const result = await analyzeService.analyze('Heute Nachmittag war ich im Park', userId, LANG);

    const heute = result.tokens.find((t) => t.surface === 'Heute');
    expect(heute?.candidates?.[0].lexeme.lemma).toBe('heute');
    expect(heute?.candidates?.[0].lexeme.partOfSpeech).toBe('ADVERB');

    const nachmittag = result.tokens.find((t) => t.surface === 'Nachmittag');
    expect(nachmittag?.candidates?.[0].lexeme.lemma).toBe('Nachmittag');

    const war = result.tokens.find((t) => t.surface === 'war');
    expect(war?.candidates?.[0].lexeme.lemma).toBe('sein');
    expect(war?.candidates?.[0].lexeme.partOfSpeech).toBe('VERB');

    const ich = result.tokens.find((t) => t.surface === 'ich');
    expect(ich?.candidates?.[0].lexeme.lemma).toBe('ich');
    expect(ich?.candidates?.[0].lexeme.partOfSpeech).toBe('PRONOUN');

    const im = result.tokens.find((t) => t.surface === 'im');
    expect(im?.candidates?.[0].lexeme.lemma).toBe('in');

    const park = result.tokens.find((t) => t.surface === 'Park');
    expect(park?.candidates?.[0].lexeme.lemma).toBe('Park');
    expect(park?.candidates?.[0].lexeme.partOfSpeech).toBe('NOUN');
  });
});
