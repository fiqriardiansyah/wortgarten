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
    const draft: StoryDraft = { title: 'Der Hund', paragraphs: ['Der Hund.', 'Ich rufe dich an.'] };

    const built = await buildStoryFromDraft(resolver, vocab(), draft, LANG);

    // Text reconstructs exactly — the Reader's `tokens.map(t => t.text).join('')` invariant.
    for (const [i, paragraph] of built.paragraphs.entries()) {
      expect(paragraph.tokens.map((t) => t.text).join('')).toBe(draft.paragraphs[i]);
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

    expect(built.glossary[hund.id]).toMatchObject({ lexemeId: hund.id, displayLemma: 'der Hund', pos: 'noun', translation: 'Hund-translation' });
    expect(built.glossary[der.id]).toBeDefined();
    expect(built.glossary[anrufen.id]).toMatchObject({ lexemeId: anrufen.id, displayLemma: 'anrufen', pos: 'verb' });
  });

  it('reports a new word as used when the draft actually contains it', async () => {
    const draft: StoryDraft = { title: 'Neugierig', paragraphs: ['Neugierig.'] };
    const built = await buildStoryFromDraft(resolver, vocab(), draft, LANG);

    expect(built.newWords).toEqual([neugierig.id]);
    const token = built.paragraphs[0].tokens.find((t) => t.text === 'Neugierig');
    expect(token).toMatchObject({ lexemeId: neugierig.id, status: 'new' });
  });

  it('still assigns a senseId to a new word with more than one sense — must match the glossary\'s own choice', async () => {
    const draft: StoryDraft = { title: 'Wegkommen', paragraphs: ['Wegkommen.'] };
    const built = await buildStoryFromDraft(resolver, vocab(), draft, LANG);

    const token = built.paragraphs[0].tokens.find((t) => t.text === 'Wegkommen');
    expect(token).toMatchObject({ lexemeId: wegkommen.id, status: 'new', senseId: wegkommen.senses[0].id });
    expect(built.glossary[wegkommen.id].translation).toBe(wegkommen.senses[0].translation);
  });
});
