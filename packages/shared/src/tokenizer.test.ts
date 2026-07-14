import { describe, expect, it } from 'vitest';
import { tokenize } from './tokenizer';

describe('tokenize', () => {
  it('splits on whitespace', () => {
    expect(tokenize('Der Hund läuft')).toEqual(['Der', 'Hund', 'läuft']);
  });

  it('drops punctuation', () => {
    expect(tokenize('Ich rufe dich an.')).toEqual(['Ich', 'rufe', 'dich', 'an']);
  });

  it('keeps hyphenated words intact', () => {
    expect(tokenize('die E-Mail-Adresse')).toEqual(['die', 'E-Mail-Adresse']);
  });

  it('preserves original casing', () => {
    expect(tokenize('Der schnelle Hund')).toEqual(['Der', 'schnelle', 'Hund']);
  });

  it('handles multiple sentences and stray punctuation', () => {
    expect(tokenize('Kommst du? Ja, ich komme!')).toEqual(['Kommst', 'du', 'Ja', 'ich', 'komme']);
  });
});
