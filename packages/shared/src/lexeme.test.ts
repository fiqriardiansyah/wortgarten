import { describe, expect, it } from 'vitest';
import { displayForm, fullDisplayForm, isIncomplete, ladderLevelColor, pluralDisplayForm } from './lexeme';

describe('displayForm', () => {
  it('shows a noun with its article', () => {
    expect(displayForm({ lemma: 'Hund', partOfSpeech: 'NOUN', gender: 'MASCULINE' })).toBe('der Hund');
    expect(displayForm({ lemma: 'Bank', partOfSpeech: 'NOUN', gender: 'FEMININE' })).toBe('die Bank');
    expect(displayForm({ lemma: 'Haus', partOfSpeech: 'NOUN', gender: 'NEUTER' })).toBe('das Haus');
  });

  it('shows a noun bare when gender is unknown (incomplete entry)', () => {
    expect(displayForm({ lemma: 'Gadget', partOfSpeech: 'NOUN', gender: null })).toBe('Gadget');
  });

  it('shows a verb as the bare lemma', () => {
    expect(displayForm({ lemma: 'kommen', partOfSpeech: 'VERB' })).toBe('kommen');
  });

  it('shows a separable verb as its full infinitive, never the bare stem', () => {
    // lemma is already the full infinitive in the data model — no prefix concatenation needed.
    expect(displayForm({ lemma: 'anrufen', partOfSpeech: 'VERB' })).toBe('anrufen');
  });

  it('shows everything else as the bare lemma', () => {
    expect(displayForm({ lemma: 'schnell', partOfSpeech: 'ADJECTIVE' })).toBe('schnell');
  });
});

describe('pluralDisplayForm', () => {
  it('always uses "die", regardless of singular gender', () => {
    expect(pluralDisplayForm({ partOfSpeech: 'NOUN', plural: 'Hunde' })).toBe('die Hunde');
  });

  it('is null when plural is unknown', () => {
    expect(pluralDisplayForm({ partOfSpeech: 'NOUN', plural: null })).toBeNull();
  });

  it('is null for non-nouns', () => {
    expect(pluralDisplayForm({ partOfSpeech: 'VERB', plural: null })).toBeNull();
  });
});

describe('fullDisplayForm', () => {
  it('combines singular and plural for a complete noun', () => {
    expect(fullDisplayForm({ lemma: 'Hund', partOfSpeech: 'NOUN', gender: 'MASCULINE', plural: 'Hunde' })).toBe(
      'der Hund / die Hunde',
    );
  });

  it('falls back to singular alone when plural is unknown', () => {
    expect(fullDisplayForm({ lemma: 'Hund', partOfSpeech: 'NOUN', gender: 'MASCULINE', plural: null })).toBe(
      'der Hund',
    );
  });

  it('is just the lemma for a verb', () => {
    expect(fullDisplayForm({ lemma: 'kommen', partOfSpeech: 'VERB', plural: null })).toBe('kommen');
  });
});

describe('isIncomplete', () => {
  it('is false for a noun with both gender and plural', () => {
    expect(isIncomplete({ partOfSpeech: 'NOUN', gender: 'MASCULINE', plural: 'Hunde' })).toBe(false);
  });

  it('is true for a noun missing gender', () => {
    expect(isIncomplete({ partOfSpeech: 'NOUN', gender: null, plural: 'Hunde' })).toBe(true);
  });

  it('is true for a noun missing plural', () => {
    expect(isIncomplete({ partOfSpeech: 'NOUN', gender: 'MASCULINE', plural: null })).toBe(true);
  });

  it('is false for non-nouns regardless of gender/plural being null', () => {
    expect(isIncomplete({ partOfSpeech: 'VERB', gender: null, plural: null })).toBe(false);
  });
});

describe('ladderLevelColor', () => {
  it('maps NEW to gray, the middle rungs to purple, MASTERED to gold', () => {
    expect(ladderLevelColor.NEW).toBe('gray');
    expect(ladderLevelColor.RECOGNIZE).toBe('purple');
    expect(ladderLevelColor.RECALL).toBe('purple');
    expect(ladderLevelColor.PRODUCE).toBe('purple');
    expect(ladderLevelColor.MASTERED).toBe('gold');
  });
});
