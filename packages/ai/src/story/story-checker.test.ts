import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient, type PartOfSpeech } from '@wortgarten/database';
import { foldForLookup } from '@wortgarten/shared';
import type { AiJob, AiRawResult } from '@wortgarten/shared';
import { LexemeResolver } from './lexeme-resolver';
import { makeStoryChecker } from './story-checker';

const LANG = 'de-story-checker-fixture';

const prisma = new PrismaClient();
const lexemeIds: string[] = [];

interface FormSeed {
  surface: string;
  features?: Record<string, unknown>;
}

async function createLexeme(params: { lemma: string; partOfSpeech: PartOfSpeech; forms: FormSeed[] }) {
  const lexeme = await prisma.lexeme.create({
    data: {
      id: randomUUID(),
      sourceKey: randomUUID(),
      language: LANG,
      lemma: params.lemma,
      partOfSpeech: params.partOfSpeech,
      senses: { create: [{ id: randomUUID(), sourceKey: randomUUID(), translation: `${params.lemma}-translation` }] },
      forms: {
        create: params.forms.map((f) => ({ surface: f.surface, normalized: foldForLookup(f.surface), features: f.features })),
      },
    },
  });
  lexemeIds.push(lexeme.id);
  return lexeme;
}

let derId: string;
let hundId: string;
let laufenId: string;
let schnellId: string;
let sehenId: string;
let katzeId: string; // deliberately left off the allowlist in every test below

beforeAll(async () => {
  // One ARTICLE lexeme carrying every surface form — mirrors how the real seeded dictionary
  // models der/die/das (see the "der/die/das-as-one-lemma" fix in packages/seed).
  derId = (await createLexeme({ lemma: 'der', partOfSpeech: 'ARTICLE', forms: [{ surface: 'Der' }, { surface: 'der' }, { surface: 'Die' }, { surface: 'die' }] })).id;
  hundId = (await createLexeme({ lemma: 'Hund', partOfSpeech: 'NOUN', forms: [{ surface: 'Hund' }] })).id;
  laufenId = (await createLexeme({ lemma: 'laufen', partOfSpeech: 'VERB', forms: [{ surface: 'läuft' }, { surface: 'laufen' }] })).id;
  schnellId = (await createLexeme({ lemma: 'schnell', partOfSpeech: 'ADJECTIVE', forms: [{ surface: 'schnell' }] })).id;
  sehenId = (await createLexeme({ lemma: 'sehen', partOfSpeech: 'VERB', forms: [{ surface: 'sieht' }, { surface: 'sehen' }] })).id;
  katzeId = (await createLexeme({ lemma: 'Katze', partOfSpeech: 'NOUN', forms: [{ surface: 'Katze' }] })).id;
});

afterAll(async () => {
  await prisma.lexeme.deleteMany({ where: { id: { in: lexemeIds } } });
  await prisma.$disconnect();
});

function job(allowlistLexemeIds: string[], maxWords = 20): AiJob {
  return { type: 'STORY', allowedWords: [], maxWords, meta: { allowlistLexemeIds } };
}

function raw(json: unknown): AiRawResult {
  return { provider: 'GROQ', json, raw: JSON.stringify(json) };
}

describe('checkStoryDraft', () => {
  const resolver = new LexemeResolver(prisma);
  const check = makeStoryChecker(resolver, LANG);

  it('accepts a draft built entirely from the allowlist', async () => {
    const allowlist = [derId, hundId, laufenId, schnellId];
    const result = await check(raw({ title: 'Der Hund', paragraphs: ['Der Hund läuft schnell.'] }), job(allowlist));
    expect(result.ok).toBe(true);
  });

  it('passes a provided translation through unchanged', async () => {
    const allowlist = [derId, hundId, laufenId, schnellId];
    const result = await check(
      raw({ title: 'Der Hund', paragraphs: ['Der Hund läuft schnell.'], translation: 'The dog runs fast.' }),
      job(allowlist),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.translation).toBe('The dog runs fast.');
  });

  it('normalizes a missing translation to null rather than rejecting the draft', async () => {
    const allowlist = [derId, hundId, laufenId, schnellId];
    const result = await check(raw({ title: 'Der Hund', paragraphs: ['Der Hund läuft schnell.'] }), job(allowlist));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.translation).toBeNull();
  });

  it('rejects a draft using a lexeme outside the allowlist', async () => {
    const allowlist = [derId, hundId, sehenId]; // no Katze
    const result = await check(raw({ title: 'Die Katze', paragraphs: ['Der Hund sieht die Katze.'] }), job(allowlist));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('USED_DISALLOWED_WORD');
    expect(result.detail).toBe('Katze');
  });

  it('rejects malformed JSON', async () => {
    const result = await check({ provider: 'GROQ', json: null, raw: 'not json' }, job([derId]));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('BAD_JSON');
  });

  it('rejects a draft with no paragraphs', async () => {
    const result = await check(raw({ title: 'Empty', paragraphs: [] }), job([derId]));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('EMPTY');
  });

  it('rejects a draft that blows past the target word count', async () => {
    const words = new Array(50).fill('Hund').join(' ');
    const result = await check(raw({ title: 'Too long', paragraphs: [`${words}.`] }), job([hundId], 10));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('TOO_LONG');
  });

  it('compares by lexemeId, not by string — a homograph outside the allowlist is still caught', async () => {
    // Two distinct lexemes spelled identically ("Bank" the bench vs "Bank" the financial
    // institution) — only one id is ever on the allowlist at a time.
    const bankBench = await createLexeme({ lemma: 'Bank', partOfSpeech: 'NOUN', forms: [{ surface: 'Bank' }] });
    const bankFinance = await createLexeme({ lemma: 'Bank', partOfSpeech: 'NOUN', forms: [{ surface: 'Bank' }] });

    const allowed = await check(raw({ title: 'Bank', paragraphs: ['Bank.'] }), job([bankFinance.id]));
    expect(allowed.ok).toBe(true); // resolution must find the allowed id even if ranking doesn't put it first

    const rejected = await check(raw({ title: 'Bank', paragraphs: ['Bank.'] }), job([derId]));
    expect(rejected.ok).toBe(false); // neither "Bank" lexeme is allowed here

    void bankBench;
  });
});
