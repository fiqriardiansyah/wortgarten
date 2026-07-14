import { describe, expect, it } from 'vitest';
import type { PartOfSpeech } from './lexeme';
import { isLemmaMatch, rankLexemes } from './ranking';

interface FakeMatch {
  label: string;
  lexeme: { lemma: string; partOfSpeech: PartOfSpeech; frequencyRank: number | null };
  senses?: { translation: string }[];
}

function candidate(label: string, lemma: string, partOfSpeech: PartOfSpeech, frequencyRank: number | null = null): FakeMatch {
  return { label, lexeme: { lemma, partOfSpeech, frequencyRank } };
}

function marginalCandidate(label: string, lemma: string, partOfSpeech: PartOfSpeech, frequencyRank: number | null, altOf: string): FakeMatch {
  return { label, lexeme: { lemma, partOfSpeech, frequencyRank }, senses: [{ translation: `alternative form of ${altOf}` }] };
}

describe('isLemmaMatch', () => {
  it('is true when the surface (any casing) is the lexeme\'s own lemma', () => {
    expect(isLemmaMatch('heute', 'heute')).toBe(true);
    expect(isLemmaMatch('Heute', 'heute')).toBe(true);
  });

  it('is false when the surface is merely an inflected form', () => {
    expect(isLemmaMatch('heute', 'heuen')).toBe(false);
  });
});

describe('rankLexemes', () => {
  it('the "heute" bug: a lemma match beats a form-only match of a rarer, unrelated lexeme', () => {
    const heuen = candidate('heuen (to make hay)', 'heuen', 'VERB', 50); // rare verb, "heute" is its ich/er-form
    const heute = candidate('heute (today)', 'heute', 'ADVERB', 9000); // common adverb, deliberately given a worse rank
    const ranked = rankLexemes([heuen, heute], { surface: 'heute', isSentenceStart: false });
    expect(ranked[0].label).toBe('heute (today)');
  });

  it('lemma-match precedence holds even when the form-only match is far more frequent', () => {
    const heuen = candidate('heuen (to make hay)', 'heuen', 'VERB', 1); // implausibly common, still a mere form here
    const heute = candidate('heute (today)', 'heute', 'ADVERB', 9000);
    const ranked = rankLexemes([heuen, heute], { surface: 'heute', isSentenceStart: false });
    expect(ranked[0].label).toBe('heute (today)');
  });

  it('breaks ties by frequencyRank ascending, nulls last', () => {
    const rare = candidate('rare', 'aus', 'PREPOSITION', 900);
    const common = candidate('common', 'aus', 'PREPOSITION', 5);
    const unranked = candidate('unranked', 'aus', 'PREPOSITION', null);
    const ranked = rankLexemes([unranked, rare, common], { surface: 'aus', isSentenceStart: false });
    expect(ranked.map((r) => r.label)).toEqual(['common', 'rare', 'unranked']);
  });

  it('a lowercase surface mid-sentence is penalized against a NOUN reading, even though the noun is the lemma match with a better rank', () => {
    const park = candidate('Park (the noun)', 'Park', 'NOUN', 10);
    const parken = candidate('parken (imperative "park")', 'parken', 'VERB', 9000);
    const ranked = rankLexemes([park, parken], { surface: 'park', isSentenceStart: false });
    expect(ranked[0].label).toBe('parken (imperative "park")');
  });

  it('a capitalized surface mid-sentence has no casing penalty, so the noun lemma match wins normally', () => {
    const park = candidate('Park (the noun)', 'Park', 'NOUN', 10);
    const parken = candidate('parken (imperative "park")', 'parken', 'VERB', 9000);
    const ranked = rankLexemes([park, parken], { surface: 'Park', isSentenceStart: false });
    expect(ranked[0].label).toBe('Park (the noun)');
  });

  it('ignores the casing signal at sentence start — a lowercase, sentence-initial surface is not penalized', () => {
    const park = candidate('Park (the noun)', 'Park', 'NOUN', 10);
    const parken = candidate('parken (imperative "park")', 'parken', 'VERB', 9000);
    const ranked = rankLexemes([park, parken], { surface: 'park', isSentenceStart: true });
    expect(ranked[0].label).toBe('Park (the noun)');
  });

  it('falls back to part-of-speech plausibility when casing, lemma-match, and frequencyRank all tie', () => {
    const other = candidate('other', 'x', 'OTHER', null);
    const verb = candidate('verb', 'x', 'VERB', null);
    const ranked = rankLexemes([other, verb], { surface: 'x', isSentenceStart: false });
    expect(ranked[0].label).toBe('verb');
  });

  it('the "war → wär" bug: a marginal alt-of lexeme loses to a common word\'s real inflected form, even though the marginal entry is the lemma match', () => {
    // Real seeded data: "wär" is its own lexeme, glossed "alternative form of wäre" (rank 140) — and
    // folds identical to "war", so it's a genuine lemma match. "war" is really the simple past of
    // "sein" (to be, rank 13), matched only as a form. Lemma-match alone would wrongly pick "wär".
    const waer = marginalCandidate('wär (marginal)', 'wär', 'VERB', 140, 'wäre');
    const sein = candidate('sein (to be)', 'sein', 'VERB', 13);
    const ranked = rankLexemes([waer, sein], { surface: 'war', isSentenceStart: false });
    expect(ranked[0].label).toBe('sein (to be)');
  });

  it('the "mir → mir(alt-of-wir)" bug: same pattern for an exact-surface (not just folded) lemma match', () => {
    // Real seeded data: "mir" itself is glossed "alternative form of wir" (rank 98) — an exact-text
    // lemma match, the strongest possible lemma-match signal — yet "mir" is really the dative of
    // "ich" (I, rank 7), matched only as a form.
    const mirAltOf = marginalCandidate('mir (marginal)', 'mir', 'PRONOUN', 98, 'wir');
    const ich = candidate('ich (I)', 'ich', 'PRONOUN', 7);
    const ranked = rankLexemes([mirAltOf, ich], { surface: 'mir', isSentenceStart: false });
    expect(ranked[0].label).toBe('ich (I)');
  });

  it('a polysemous lexeme with one alt-of cross-reference sense among several real ones is NOT treated as marginal', () => {
    // Real seeded data: "er" (he/it/she, rank 5) has 5 senses; one of them happens to read
    // "alternative spelling of Er (you, polite)" — that must not demote the whole common pronoun.
    const er = candidate('er (he/it/she)', 'er', 'PRONOUN', 5);
    er.senses = [
      { translation: 'he' },
      { translation: 'it' },
      { translation: 'alternative spelling of Er (you, polite)' },
    ];
    const erFormalNoun = candidate('Er (formal address noun)', 'Er', 'NOUN', 57);
    const ranked = rankLexemes([erFormalNoun, er], { surface: 'Er', isSentenceStart: true });
    expect(ranked[0].label).toBe('er (he/it/she)');
  });

  it('a marginal alt-of lexeme is still returned, just not preferred — ambiguity is never collapsed', () => {
    const waer = marginalCandidate('wär (marginal)', 'wär', 'VERB', 140, 'wäre');
    const sein = candidate('sein (to be)', 'sein', 'VERB', 13);
    const ranked = rankLexemes([waer, sein], { surface: 'war', isSentenceStart: false });
    expect(ranked).toHaveLength(2);
  });

  it('never drops a candidate — only reorders', () => {
    const a = candidate('a', 'a', 'NOUN', 1);
    const b = candidate('b', 'b', 'VERB', 2);
    const ranked = rankLexemes([a, b], { surface: 'a', isSentenceStart: false });
    expect(ranked).toHaveLength(2);
  });
});
