import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient, type Gender, type PartOfSpeech } from '@wortgarten/database';
import { foldForLookup } from '@wortgarten/shared';
import type { StoryDraft } from '@wortgarten/shared';
import { buildStoryFromDraft } from './build-story-tokens';
import { LexemeResolver } from './lexeme-resolver';
import type { StoryVocabulary } from './select-vocabulary';

const LANG = 'de-story-builder-fixture';

const prisma = new PrismaClient();
const lexemeIds: string[] = [];

interface FormSeed {
  surface: string;
}

async function createLexeme(params: { lemma: string; partOfSpeech: PartOfSpeech; gender?: Gender; separablePrefix?: string; forms: FormSeed[] }) {
  const lexeme = await prisma.lexeme.create({
    data: {
      id: randomUUID(),
      sourceKey: randomUUID(),
      language: LANG,
      lemma: params.lemma,
      partOfSpeech: params.partOfSpeech,
      gender: params.gender,
      separablePrefix: params.separablePrefix,
      senses: { create: [{ id: randomUUID(), sourceKey: randomUUID(), translation: `${params.lemma}-translation` }] },
      forms: { create: params.forms.map((f) => ({ surface: f.surface, normalized: foldForLookup(f.surface) })) },
    },
    include: { senses: true },
  });
  lexemeIds.push(lexeme.id);
  return lexeme;
}

let der: Awaited<ReturnType<typeof createLexeme>>;
let hund: Awaited<ReturnType<typeof createLexeme>>;
let ich: Awaited<ReturnType<typeof createLexeme>>;
let dich: Awaited<ReturnType<typeof createLexeme>>;
let anrufen: Awaited<ReturnType<typeof createLexeme>>;
let neugierig: Awaited<ReturnType<typeof createLexeme>>;
let wegkommen: Awaited<ReturnType<typeof createLexeme>>;
let katze: Awaited<ReturnType<typeof createLexeme>>; // real lexeme, deliberately left off the allowlist

async function createPolysemousLexeme(params: { lemma: string; partOfSpeech: PartOfSpeech; forms: FormSeed[] }) {
  const lexeme = await prisma.lexeme.create({
    data: {
      id: randomUUID(),
      sourceKey: randomUUID(),
      language: LANG,
      lemma: params.lemma,
      partOfSpeech: params.partOfSpeech,
      senses: {
        create: [
          { id: randomUUID(), sourceKey: randomUUID(), translation: `${params.lemma}-sense-1` },
          { id: randomUUID(), sourceKey: randomUUID(), translation: `${params.lemma}-sense-2` },
        ],
      },
      forms: { create: params.forms.map((f) => ({ surface: f.surface, normalized: foldForLookup(f.surface) })) },
    },
    include: { senses: true },
  });
  lexemeIds.push(lexeme.id);
  return lexeme;
}

beforeAll(async () => {
  der = await createLexeme({ lemma: 'der', partOfSpeech: 'ARTICLE', forms: [{ surface: 'Der' }, { surface: 'der' }] });
  hund = await createLexeme({ lemma: 'Hund', partOfSpeech: 'NOUN', gender: 'MASCULINE', forms: [{ surface: 'Hund' }] });
  ich = await createLexeme({ lemma: 'ich', partOfSpeech: 'PRONOUN', forms: [{ surface: 'Ich' }] });
  dich = await createLexeme({ lemma: 'dich', partOfSpeech: 'PRONOUN', forms: [{ surface: 'dich' }] });
  anrufen = await createLexeme({
    lemma: 'anrufen',
    partOfSpeech: 'VERB',
    separablePrefix: 'an',
    forms: [{ surface: 'rufe' }, { surface: 'ruft' }, { surface: 'anrufen' }],
  });
  neugierig = await createLexeme({ lemma: 'neugierig', partOfSpeech: 'ADJECTIVE', forms: [{ surface: 'Neugierig' }] });
  wegkommen = await createPolysemousLexeme({ lemma: 'wegkommen', partOfSpeech: 'VERB', forms: [{ surface: 'wegkommen' }] });
  katze = await createLexeme({ lemma: 'Katze', partOfSpeech: 'NOUN', gender: 'FEMININE', forms: [{ surface: 'Katze' }] });
});

afterAll(async () => {
  await prisma.lexeme.deleteMany({ where: { id: { in: lexemeIds } } });
  await prisma.$disconnect();
});

function vocab(): StoryVocabulary {
  return {
    knownLexemeIds: new Set([hund.id, anrufen.id]),
    functionLexemeIds: new Set([der.id, ich.id, dich.id]),
    knownSenseByLexeme: new Map([
      [hund.id, hund.senses[0].id],
      [anrufen.id, anrufen.senses[0].id],
    ]),
    newWords: [
      { lexemeId: neugierig.id, displayLemma: 'neugierig' },
      { lexemeId: wegkommen.id, displayLemma: 'wegkommen' },
    ],
    allowlistIds: new Set([der.id, hund.id, ich.id, dich.id, anrufen.id, neugierig.id, wegkommen.id]),
    allowlistDisplay: ['der', 'Hund', 'ich', 'dich', 'anrufen', 'neugierig', 'wegkommen'],
    targetWordCount: 100,
  };
}

describe('buildStoryFromDraft', () => {
  const resolver = new LexemeResolver(prisma);

  it('builds tokens with the right kind/status/lexemeId, reassembles separable verbs, and skips unused new words', async () => {
    const draft: StoryDraft = { title: 'Der Hund', story: 'Der Hund.\n\nIch rufe dich an.' };
    const expectedParagraphTexts = ['Der Hund.', 'Ich rufe dich an.'];

    const built = await buildStoryFromDraft(resolver, vocab(), draft, LANG);

    // Text reconstructs exactly — the Reader's `tokens.map(t => t.text).join('')` invariant.
    for (const [i, paragraph] of built.paragraphs.entries()) {
      expect(paragraph.tokens.map((t) => t.text).join('')).toBe(expectedParagraphTexts[i]);
    }

    const [p1, p2] = built.paragraphs;

    const derToken = p1.tokens.find((t) => t.text === 'Der');
    expect(derToken).toMatchObject({ kind: 'word', lexemeId: der.id, status: 'function' });

    const hundToken = p1.tokens.find((t) => t.text === 'Hund');
    expect(hundToken).toMatchObject({ kind: 'word', lexemeId: hund.id, status: 'known', senseId: hund.senses[0].id });

    const punctToken = p1.tokens.find((t) => t.text === '.');
    expect(punctToken).toMatchObject({ kind: 'punct', lexemeId: null, senseId: null });

    // "rufe" ... "an" reassemble into one lexeme (anrufen), both tokens tagged known.
    const rufeToken = p2.tokens.find((t) => t.text === 'rufe');
    const anToken = p2.tokens.find((t) => t.text === 'an');
    expect(rufeToken).toMatchObject({ lexemeId: anrufen.id, status: 'known' });
    expect(anToken).toMatchObject({ lexemeId: anrufen.id, status: 'known' });

    // neugierig was in the vocab's newWords but never used in the draft — must be dropped.
    expect(built.newWords).toEqual([]);
    expect(built.coverageKnownPct).toBe(100);
    expect(built.unresolvedSurfaces).toEqual([]);

    expect(built.glossary[hund.id]).toMatchObject({ lexemeId: hund.id, displayLemma: 'der Hund', pos: 'noun', translation: 'Hund-translation' });
    expect(built.glossary[der.id]).toBeDefined();
    expect(built.glossary[anrufen.id]).toMatchObject({ lexemeId: anrufen.id, displayLemma: 'anrufen', pos: 'verb' });
  });

  it('reports a new word as used when the draft actually contains it', async () => {
    const draft: StoryDraft = { title: 'Neugierig', story: 'Neugierig.' };
    const built = await buildStoryFromDraft(resolver, vocab(), draft, LANG);

    expect(built.newWords).toEqual([neugierig.id]);
    const token = built.paragraphs[0].tokens.find((t) => t.text === 'Neugierig');
    expect(token).toMatchObject({ lexemeId: neugierig.id, status: 'new' });
  });

  it('still assigns a senseId to a new word with more than one sense — must match the glossary\'s own choice', async () => {
    const draft: StoryDraft = { title: 'Wegkommen', story: 'Wegkommen.' };
    const built = await buildStoryFromDraft(resolver, vocab(), draft, LANG);

    const token = built.paragraphs[0].tokens.find((t) => t.text === 'Wegkommen');
    expect(token).toMatchObject({ lexemeId: wegkommen.id, status: 'new', senseId: wegkommen.senses[0].id });
    expect(built.glossary[wegkommen.id].translation).toBe(wegkommen.senses[0].translation);
  });

  it('tags a word that resolves to a real lexeme outside the allowlist as unknown-but-glossaried', async () => {
    const draft: StoryDraft = { title: 'Katze', story: 'Katze.' };
    const built = await buildStoryFromDraft(resolver, vocab(), draft, LANG);

    const token = built.paragraphs[0].tokens.find((t) => t.text === 'Katze');
    expect(token).toMatchObject({ lexemeId: katze.id, senseId: null, status: 'unknown' });
    expect(built.glossary[katze.id]).toMatchObject({ lexemeId: katze.id, displayLemma: 'die Katze', translation: 'Katze-translation' });
    expect(built.unresolvedSurfaces).toEqual([]);
  });

  it('tags a word that resolves to nothing at all as unknown with a null lexemeId, never throwing', async () => {
    const draft: StoryDraft = { title: 'Xyzzyplex', story: 'Xyzzyplex.' };
    const built = await buildStoryFromDraft(resolver, vocab(), draft, LANG);

    const token = built.paragraphs[0].tokens.find((t) => t.text === 'Xyzzyplex');
    expect(token).toMatchObject({ lexemeId: null, senseId: null, status: 'unknown' });
    expect(Object.keys(built.glossary)).toHaveLength(0);
    expect(built.unresolvedSurfaces).toEqual(['Xyzzyplex']);
  });

  it('computes real coverage math from a mix of known, unknown-glossaried, and unresolved words', async () => {
    const draft: StoryDraft = { title: 'Mix', story: 'Hund Katze Xyzzyplex.' };
    const built = await buildStoryFromDraft(resolver, vocab(), draft, LANG);

    expect(built.totalWordCount).toBe(3);
    // 1 known (Hund) out of 3 total -> round(1/3*100) = 33.
    expect(built.coverageKnownPct).toBe(33);
  });

  it('truncates at a paragraph boundary when the draft runs well past the target word count, keeping translation in sync', async () => {
    const v = { ...vocab(), targetWordCount: 5 }; // slack 1.6 -> limit 8 words
    const draft: StoryDraft = {
      title: 'Der Hund',
      story: 'Der Hund läuft.\n\nDer Hund schläft.\n\nHund Hund Hund Hund Hund Hund Hund.',
      translation: 'The dog runs.\n\nThe dog sleeps.\n\nDog dog dog dog dog dog dog.',
    };

    const built = await buildStoryFromDraft(resolver, v, draft, LANG);

    expect(built.paragraphs).toHaveLength(2);
    expect(built.translation).toBe('The dog runs.\n\nThe dog sleeps.');
  });

  it('keeps at least the first paragraph even when it alone exceeds the slack budget', async () => {
    const v = { ...vocab(), targetWordCount: 1 }; // limit ~1.6 words
    const draft: StoryDraft = { title: 'Long', story: 'Hund Hund Hund Hund Hund.\n\nHund Hund.' };

    const built = await buildStoryFromDraft(resolver, v, draft, LANG);

    expect(built.paragraphs).toHaveLength(1);
  });
});
