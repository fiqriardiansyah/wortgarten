import { displayForm } from '@wortgarten/shared';
import type { Story, StoryParagraph, StoryToken, StoryGlossaryEntry, ReadingLevel, Gender, PartOfSpeech } from '@wortgarten/shared';

// ─── Fixture — stand-in for GET /stories and GET /stories/:id ─────────────
//
// Hand-authored, not runtime-tokenized (the point of this fixture is that a real
// worker would have produced exactly this token/glossary shape overnight). The
// helpers below are pure authoring sugar for THIS file only — nothing here runs
// in the Reader.

interface WordSpec {
  text: string;
  lexemeId: string;
  senseId: string | null;
  status: StoryToken['status'];
}

function w({ text, lexemeId, senseId, status }: WordSpec): StoryToken {
  return { text, kind: 'word', lexemeId, senseId, status };
}

function punct(text: string): StoryToken {
  return { text, kind: 'punct', lexemeId: null, senseId: null, status: 'function' };
}

const SPACE: StoryToken = { text: ' ', kind: 'space', lexemeId: null, senseId: null, status: 'function' };

function para(...tokens: StoryToken[]): StoryParagraph {
  return { tokens };
}

function glossaryEntry(
  lexemeId: string,
  lemma: string,
  partOfSpeech: PartOfSpeech,
  gender: Gender | null,
  posLabel: string,
  translation: string,
): StoryGlossaryEntry {
  return { lexemeId, displayLemma: displayForm({ lemma, partOfSpeech, gender }), pos: posLabel, translation };
}

// ─── Story: "Der schnelle Hund" (today's hero) ─────────────────────────────

const heroGlossary: Record<string, StoryGlossaryEntry> = {
  'lex-der': glossaryEntry('lex-der', 'der', 'ARTICLE', null, 'article', 'the'),
  'lex-hund': glossaryEntry('lex-hund', 'Hund', 'NOUN', 'MASCULINE', 'noun', 'dog'),
  'lex-sein': glossaryEntry('lex-sein', 'sein', 'VERB', null, 'verb', 'to be'),
  'lex-schnell': glossaryEntry('lex-schnell', 'schnell', 'ADJECTIVE', null, 'adjective', 'fast'),
  'lex-er': glossaryEntry('lex-er', 'er', 'PRONOUN', null, 'pronoun', 'he'),
  'lex-laufen': glossaryEntry('lex-laufen', 'laufen', 'VERB', null, 'verb', 'to run'),
  'lex-jeder': glossaryEntry('lex-jeder', 'jeder', 'PRONOUN', null, 'pronoun', 'every'),
  'lex-morgen': glossaryEntry('lex-morgen', 'Morgen', 'NOUN', 'MASCULINE', 'noun', 'morning'),
  'lex-in': glossaryEntry('lex-in', 'in', 'PREPOSITION', null, 'preposition', 'in'),
  'lex-park': glossaryEntry('lex-park', 'Park', 'NOUN', 'MASCULINE', 'noun', 'park'),
  'lex-katze': glossaryEntry('lex-katze', 'Katze', 'NOUN', 'FEMININE', 'noun', 'cat'),
  'lex-sehen': glossaryEntry('lex-sehen', 'sehen', 'VERB', null, 'verb', 'to see'),
  'lex-warum': glossaryEntry('lex-warum', 'warum', 'ADVERB', null, 'adverb', 'why'),
  'lex-du': glossaryEntry('lex-du', 'du', 'PRONOUN', null, 'pronoun', 'you'),
  'lex-so': glossaryEntry('lex-so', 'so', 'ADVERB', null, 'adverb', 'so'),
  'lex-fragen': glossaryEntry('lex-fragen', 'fragen', 'VERB', null, 'verb', 'to ask'),
  'lex-sie': glossaryEntry('lex-sie', 'sie', 'PRONOUN', null, 'pronoun', 'she'),
  'lex-neugierig': glossaryEntry('lex-neugierig', 'neugierig', 'ADJECTIVE', null, 'adjective', 'curious'),
  'lex-ich': glossaryEntry('lex-ich', 'ich', 'PRONOUN', null, 'pronoun', 'I'),
  'lex-weil': glossaryEntry('lex-weil', 'weil', 'CONJUNCTION', null, 'conjunction', 'because'),
  'lex-es': glossaryEntry('lex-es', 'es', 'PRONOUN', null, 'pronoun', 'it'),
  'lex-mir': glossaryEntry('lex-mir', 'mir', 'PRONOUN', null, 'pronoun', '(to) me'),
  'lex-freude': glossaryEntry('lex-freude', 'Freude', 'NOUN', 'FEMININE', 'noun', 'joy'),
  'lex-machen': glossaryEntry('lex-machen', 'machen', 'VERB', null, 'verb', 'to make'),
  'lex-sagen': glossaryEntry('lex-sagen', 'sagen', 'VERB', null, 'verb', 'to say'),
  'lex-und': glossaryEntry('lex-und', 'und', 'CONJUNCTION', null, 'conjunction', 'and'),
  'lex-lachen': glossaryEntry('lex-lachen', 'lachen', 'VERB', null, 'verb', 'to laugh'),
};

const heroParagraphs: StoryParagraph[] = [
  para(
    w({ text: 'Der', lexemeId: 'lex-der', senseId: null, status: 'function' }),
    SPACE,
    w({ text: 'Hund', lexemeId: 'lex-hund', senseId: 'sense-hund', status: 'known' }),
    SPACE,
    w({ text: 'ist', lexemeId: 'lex-sein', senseId: null, status: 'function' }),
    SPACE,
    w({ text: 'schnell', lexemeId: 'lex-schnell', senseId: 'sense-schnell', status: 'known' }),
    punct('.'),
    SPACE,
    w({ text: 'Er', lexemeId: 'lex-er', senseId: null, status: 'function' }),
    SPACE,
    w({ text: 'läuft', lexemeId: 'lex-laufen', senseId: 'sense-laufen', status: 'known' }),
    SPACE,
    w({ text: 'jeden', lexemeId: 'lex-jeder', senseId: null, status: 'function' }),
    SPACE,
    w({ text: 'Morgen', lexemeId: 'lex-morgen', senseId: 'sense-morgen', status: 'known' }),
    SPACE,
    w({ text: 'in', lexemeId: 'lex-in', senseId: null, status: 'function' }),
    SPACE,
    w({ text: 'den', lexemeId: 'lex-der', senseId: null, status: 'function' }),
    SPACE,
    w({ text: 'Park', lexemeId: 'lex-park', senseId: 'sense-park', status: 'known' }),
    punct('.'),
  ),
  para(
    w({ text: 'Die', lexemeId: 'lex-der', senseId: null, status: 'function' }),
    SPACE,
    w({ text: 'Katze', lexemeId: 'lex-katze', senseId: 'sense-katze', status: 'known' }),
    SPACE,
    w({ text: 'sieht', lexemeId: 'lex-sehen', senseId: 'sense-sehen', status: 'known' }),
    SPACE,
    w({ text: 'den', lexemeId: 'lex-der', senseId: null, status: 'function' }),
    SPACE,
    w({ text: 'Hund', lexemeId: 'lex-hund', senseId: 'sense-hund', status: 'known' }),
    punct('.'),
    SPACE,
    punct('"'),
    w({ text: 'Warum', lexemeId: 'lex-warum', senseId: null, status: 'function' }),
    SPACE,
    w({ text: 'läufst', lexemeId: 'lex-laufen', senseId: 'sense-laufen', status: 'known' }),
    SPACE,
    w({ text: 'du', lexemeId: 'lex-du', senseId: null, status: 'function' }),
    SPACE,
    w({ text: 'so', lexemeId: 'lex-so', senseId: null, status: 'function' }),
    SPACE,
    w({ text: 'schnell', lexemeId: 'lex-schnell', senseId: 'sense-schnell', status: 'known' }),
    punct('?'),
    punct('"'),
    SPACE,
    w({ text: 'fragt', lexemeId: 'lex-fragen', senseId: 'sense-fragen', status: 'known' }),
    SPACE,
    w({ text: 'sie', lexemeId: 'lex-sie', senseId: null, status: 'function' }),
    SPACE,
    w({ text: 'neugierig', lexemeId: 'lex-neugierig', senseId: 'sense-neugierig', status: 'new' }),
    punct('.'),
  ),
  para(
    punct('"'),
    w({ text: 'Ich', lexemeId: 'lex-ich', senseId: null, status: 'function' }),
    SPACE,
    w({ text: 'laufe', lexemeId: 'lex-laufen', senseId: 'sense-laufen', status: 'known' }),
    SPACE,
    w({ text: 'schnell', lexemeId: 'lex-schnell', senseId: 'sense-schnell', status: 'known' }),
    punct(','),
    SPACE,
    w({ text: 'weil', lexemeId: 'lex-weil', senseId: null, status: 'function' }),
    SPACE,
    w({ text: 'es', lexemeId: 'lex-es', senseId: null, status: 'function' }),
    SPACE,
    w({ text: 'mir', lexemeId: 'lex-mir', senseId: null, status: 'function' }),
    SPACE,
    w({ text: 'Freude', lexemeId: 'lex-freude', senseId: 'sense-freude', status: 'new' }),
    SPACE,
    w({ text: 'macht', lexemeId: 'lex-machen', senseId: 'sense-machen', status: 'known' }),
    punct('!'),
    punct('"'),
    SPACE,
    w({ text: 'sagt', lexemeId: 'lex-sagen', senseId: 'sense-sagen', status: 'known' }),
    SPACE,
    w({ text: 'der', lexemeId: 'lex-der', senseId: null, status: 'function' }),
    SPACE,
    w({ text: 'Hund', lexemeId: 'lex-hund', senseId: 'sense-hund', status: 'known' }),
    SPACE,
    w({ text: 'und', lexemeId: 'lex-und', senseId: null, status: 'function' }),
    SPACE,
    w({ text: 'lacht', lexemeId: 'lex-lachen', senseId: 'sense-lachen', status: 'known' }),
    punct('.'),
  ),
];

const heroStory: Story = {
  id: 'story-der-schnelle-hund',
  title: 'Der schnelle Hund',
  blurb: 'A little dog discovers he is the fastest in the park — and a curious cat wants to know why.',
  status: 'READY',
  source: 'SEED',
  estMinutes: 2,
  isNewToday: true,
  coverageKnownPct: 100,
  paragraphs: heroParagraphs,
  translation:
    'The dog is fast. He runs every morning in the park. The cat sees the dog. "Why do you run so fast?" she asks curiously. "I run fast because it brings me joy!" says the dog and laughs.',
  newWords: ['lex-neugierig', 'lex-freude'],
  glossary: heroGlossary,
  createdAt: '2026-07-17T06:00:00.000Z',
  isRead: false,
  coverImageUrl: null,
};

// ─── Earlier story: "Im Supermarkt" ────────────────────────────────────────

const supermarktGlossary: Record<string, StoryGlossaryEntry> = {
  'lex-anna': glossaryEntry('lex-anna', 'Anna', 'NOUN', null, 'name', 'Anna'),
  'lex-kaufen': glossaryEntry('lex-kaufen', 'kaufen', 'VERB', null, 'verb', 'to buy'),
  'lex-brot': glossaryEntry('lex-brot', 'Brot', 'NOUN', 'NEUTER', 'noun', 'bread'),
  'lex-milch': glossaryEntry('lex-milch', 'Milch', 'NOUN', 'FEMININE', 'noun', 'milk'),
  'lex-und': glossaryEntry('lex-und', 'und', 'CONJUNCTION', null, 'conjunction', 'and'),
  'lex-apfel': glossaryEntry('lex-apfel', 'Apfel', 'NOUN', 'MASCULINE', 'noun', 'apple'),
};

const supermarktStory: Story = {
  id: 'story-im-supermarkt',
  title: 'Im Supermarkt',
  blurb: 'Buying bread, milk and apples.',
  status: 'READY',
  source: 'SEED',
  estMinutes: 3,
  isNewToday: false,
  coverageKnownPct: 100,
  paragraphs: [
    para(
      w({ text: 'Anna', lexemeId: 'lex-anna', senseId: 'sense-anna', status: 'known' }),
      SPACE,
      w({ text: 'kauft', lexemeId: 'lex-kaufen', senseId: 'sense-kaufen', status: 'known' }),
      SPACE,
      w({ text: 'Brot', lexemeId: 'lex-brot', senseId: 'sense-brot', status: 'new' }),
      punct(','),
      SPACE,
      w({ text: 'Milch', lexemeId: 'lex-milch', senseId: 'sense-milch', status: 'known' }),
      SPACE,
      w({ text: 'und', lexemeId: 'lex-und', senseId: null, status: 'function' }),
      SPACE,
      w({ text: 'Äpfel', lexemeId: 'lex-apfel', senseId: 'sense-apfel', status: 'known' }),
      punct('.'),
    ),
  ],
  translation: 'Anna buys bread, milk, and apples.',
  newWords: ['lex-brot'],
  glossary: supermarktGlossary,
  createdAt: '2026-07-16T06:00:00.000Z',
  isRead: true,
  coverImageUrl: null,
};

// ─── Earlier story: "Der Hund läuft nach Hause" ────────────────────────────

const hundNachHauseGlossary: Record<string, StoryGlossaryEntry> = {
  'lex-der': heroGlossary['lex-der'],
  'lex-hund': heroGlossary['lex-hund'],
  'lex-laufen': heroGlossary['lex-laufen'],
  'lex-schnell': heroGlossary['lex-schnell'],
  'lex-nach': glossaryEntry('lex-nach', 'nach', 'PREPOSITION', null, 'preposition', 'to, towards'),
  'lex-hause': glossaryEntry('lex-hause', 'Hause', 'NOUN', 'NEUTER', 'noun', 'home'),
};

const hundNachHauseStory: Story = {
  id: 'story-hund-nach-hause',
  title: 'Der Hund läuft nach Hause',
  blurb: 'The dog finds his way home at night.',
  status: 'READY',
  source: 'SEED',
  estMinutes: 4,
  isNewToday: false,
  coverageKnownPct: 100,
  paragraphs: [
    para(
      w({ text: 'Der', lexemeId: 'lex-der', senseId: null, status: 'function' }),
      SPACE,
      w({ text: 'Hund', lexemeId: 'lex-hund', senseId: 'sense-hund', status: 'known' }),
      SPACE,
      w({ text: 'läuft', lexemeId: 'lex-laufen', senseId: 'sense-laufen', status: 'known' }),
      SPACE,
      w({ text: 'schnell', lexemeId: 'lex-schnell', senseId: 'sense-schnell', status: 'known' }),
      SPACE,
      w({ text: 'nach', lexemeId: 'lex-nach', senseId: null, status: 'function' }),
      SPACE,
      w({ text: 'Hause', lexemeId: 'lex-hause', senseId: 'sense-hause', status: 'new' }),
      punct('.'),
    ),
  ],
  translation: 'The dog runs quickly home.',
  newWords: ['lex-hause'],
  glossary: hundNachHauseGlossary,
  createdAt: '2026-07-15T06:00:00.000Z',
  isRead: true,
  coverImageUrl: null,
};

// ─── Earlier story: "Ein guter Morgen" — translation intentionally null ───

const guterMorgenGlossary: Record<string, StoryGlossaryEntry> = {
  'lex-anna': supermarktGlossary['lex-anna'],
  'lex-essen': glossaryEntry('lex-essen', 'essen', 'VERB', null, 'verb', 'to eat'),
  'lex-ihr-poss': glossaryEntry('lex-ihr-poss', 'ihr', 'PRONOUN', null, 'pronoun', 'her'),
  'lex-fruehstueck': glossaryEntry('lex-fruehstueck', 'Frühstück', 'NOUN', 'NEUTER', 'noun', 'breakfast'),
};

const guterMorgenStory: Story = {
  id: 'story-ein-guter-morgen',
  title: 'Ein guter Morgen',
  blurb: 'Anna wakes up and makes breakfast.',
  status: 'READY',
  source: 'SEED',
  estMinutes: 2,
  isNewToday: false,
  coverageKnownPct: 100,
  paragraphs: [
    para(
      w({ text: 'Anna', lexemeId: 'lex-anna', senseId: 'sense-anna', status: 'known' }),
      SPACE,
      w({ text: 'isst', lexemeId: 'lex-essen', senseId: 'sense-essen', status: 'known' }),
      SPACE,
      w({ text: 'ihr', lexemeId: 'lex-ihr-poss', senseId: null, status: 'function' }),
      SPACE,
      w({ text: 'Frühstück', lexemeId: 'lex-fruehstueck', senseId: 'sense-fruehstueck', status: 'known' }),
      punct('.'),
    ),
  ],
  // No translation yet for this one — exercises the nullable path end-to-end.
  translation: null,
  newWords: [],
  glossary: guterMorgenGlossary,
  createdAt: '2026-07-14T06:00:00.000Z',
  isRead: true,
  coverImageUrl: null,
};

// ─── Earlier story: "Die Katze und der Park" — oldest, still unread ───────

const katzeParkGlossary: Record<string, StoryGlossaryEntry> = {
  'lex-der': heroGlossary['lex-der'],
  'lex-katze': heroGlossary['lex-katze'],
  'lex-sehen': heroGlossary['lex-sehen'],
  'lex-ein': glossaryEntry('lex-ein', 'ein', 'ARTICLE', null, 'article', 'a'),
  'lex-eichhoernchen': glossaryEntry('lex-eichhoernchen', 'Eichhörnchen', 'NOUN', 'NEUTER', 'noun', 'squirrel'),
  'lex-und': heroGlossary['lex-und'],
  'lex-es': heroGlossary['lex-es'],
  'lex-verstecken': glossaryEntry('lex-verstecken', 'verstecken', 'VERB', null, 'verb', 'to hide'),
  'lex-sich': glossaryEntry('lex-sich', 'sich', 'PRONOUN', null, 'pronoun', 'itself'),
};

const katzeParkStory: Story = {
  id: 'story-katze-park',
  title: 'Die Katze und der Park',
  blurb: 'A curious cat explores the big park.',
  status: 'READY',
  source: 'SEED',
  estMinutes: 3,
  isNewToday: false,
  coverageKnownPct: 100,
  paragraphs: [
    para(
      w({ text: 'Die', lexemeId: 'lex-der', senseId: null, status: 'function' }),
      SPACE,
      w({ text: 'Katze', lexemeId: 'lex-katze', senseId: 'sense-katze', status: 'known' }),
      SPACE,
      w({ text: 'sieht', lexemeId: 'lex-sehen', senseId: 'sense-sehen', status: 'known' }),
      SPACE,
      w({ text: 'ein', lexemeId: 'lex-ein', senseId: null, status: 'function' }),
      SPACE,
      w({ text: 'Eichhörnchen', lexemeId: 'lex-eichhoernchen', senseId: 'sense-eichhoernchen', status: 'new' }),
      SPACE,
      w({ text: 'und', lexemeId: 'lex-und', senseId: null, status: 'function' }),
      SPACE,
      w({ text: 'es', lexemeId: 'lex-es', senseId: null, status: 'function' }),
      SPACE,
      w({ text: 'versteckt', lexemeId: 'lex-verstecken', senseId: 'sense-verstecken', status: 'new' }),
      SPACE,
      w({ text: 'sich', lexemeId: 'lex-sich', senseId: null, status: 'function' }),
      punct('.'),
    ),
  ],
  translation: 'The cat sees a squirrel and it hides.',
  newWords: ['lex-eichhoernchen', 'lex-verstecken'],
  glossary: katzeParkGlossary,
  createdAt: '2026-07-10T06:00:00.000Z',
  isRead: false,
  coverImageUrl: null,
};

// ─── Tomorrow's story — GENERATING, not tappable, no body yet ─────────────

const tomorrowStory: Story = {
  id: 'story-tomorrow',
  title: 'Tomorrow’s story',
  blurb: null,
  status: 'GENERATING',
  source: null,
  estMinutes: 0,
  isNewToday: false,
  coverageKnownPct: 0,
  paragraphs: [],
  translation: null,
  newWords: [],
  glossary: {},
  createdAt: '2026-07-18T02:00:00.000Z',
  isRead: false,
  coverImageUrl: null,
};

// ─── Library fixture ────────────────────────────────────────────────────
//
// Order matters here: it's display/recency order, and it's what the "Picked up
// while reading" rail flattens `newWords` from (most recent stories first).

export const libraryStories: Story[] = [
  heroStory,
  supermarktStory,
  hundNachHauseStory,
  guterMorgenStory,
  katzeParkStory,
  tomorrowStory,
];

export const readingLevelFixture: ReadingLevel = {
  wordsUnlocked: 214,
  nextThreshold: 300,
  nextUnlockLabel: '5-minute stories',
  wordsToGo: 86,
};

export const derSchnelleHundStory = heroStory;
