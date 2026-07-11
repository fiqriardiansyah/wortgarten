import { describe, expect, it } from 'vitest';
import { foldForLookup, normalizeInput } from './text';

describe('normalizeInput', () => {
  it('trims whitespace', () => {
    expect(normalizeInput('  Hund  ')).toBe('Hund');
  });

  it('applies NFC normalization', () => {
    const decomposed = 'Kühe'; // "u" + combining diaeresis (NFD)
    const composed = 'Kühe'; // precomposed "ü" (NFC)
    expect(normalizeInput(decomposed)).toBe(composed);
    expect(normalizeInput(decomposed).length).toBe(4);
  });
});

describe('foldForLookup', () => {
  it('lowercases', () => {
    expect(foldForLookup('Hund')).toBe('hund');
  });

  it('folds umlauts', () => {
    expect(foldForLookup('für')).toBe('fur');
    expect(foldForLookup('schön')).toBe('schon');
    expect(foldForLookup('Bücher')).toBe('bucher');
  });

  it('folds uppercase umlauts via lowercase pass', () => {
    expect(foldForLookup('Übung')).toBe('ubung');
  });

  it('folds ß to ss', () => {
    expect(foldForLookup('Straße')).toBe('strasse');
  });

  it('trims and NFC-normalizes before folding', () => {
    expect(foldForLookup('  Grüße  ')).toBe('grusse');
  });

  it('round-trips: folding an already-folded string is stable', () => {
    const once = foldForLookup('Wörterbücher');
    expect(foldForLookup(once)).toBe(once);
  });

  it('WordForm.normalized round-trip: write and query use the same fold', () => {
    const surface = 'Hünde'; // fictitious form, exercises umlaut fold both ways
    const written = foldForLookup(surface);
    const queried = foldForLookup('Hünde');
    expect(written).toBe(queried);
  });
});
