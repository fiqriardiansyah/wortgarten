import { describe, expect, it } from 'vitest';
import { checkSanitySentence, normalizeGermanWord } from './ai';
import type { AiJob, AiRawResult } from './ai';

const job: AiJob = {
  type: 'SANITY_SENTENCE',
  allowedWords: ['der', 'Hund', 'ist', 'läuft', 'schnell', 'schön'],
  maxWords: 8,
};

// Mirrors what a real adapter guarantees: `raw` is always the actual text response, even when
// it can't be parsed as JSON — never the literal JS `undefined` that `JSON.stringify(undefined)`
// produces.
function rawFrom(json: unknown, provider: AiRawResult['provider'] = 'GROQ'): AiRawResult {
  const raw = typeof json === 'string' ? json : (JSON.stringify(json) ?? String(json));
  return { provider, json, raw };
}

describe('checkSanitySentence', () => {
  it('rejects invalid JSON shape', () => {
    const result = checkSanitySentence(rawFrom('not even json-shaped'), job);
    expect(result).toMatchObject({ ok: false, reason: 'BAD_JSON' });
  });

  it('rejects missing sentence key', () => {
    const result = checkSanitySentence(rawFrom({ notSentence: 'x' }), job);
    expect(result).toMatchObject({ ok: false, reason: 'BAD_JSON' });
  });

  it('rejects an empty sentence', () => {
    const result = checkSanitySentence(rawFrom({ sentence: '   ' }), job);
    expect(result).toMatchObject({ ok: false, reason: 'EMPTY' });
  });

  it('rejects a sentence over maxWords', () => {
    const result = checkSanitySentence(rawFrom({ sentence: 'Der Hund läuft schnell schnell schnell schnell schnell schnell.' }), job);
    expect(result).toMatchObject({ ok: false, reason: 'TOO_LONG' });
  });

  it('rejects a sentence using a word not on the allowlist', () => {
    const result = checkSanitySentence(rawFrom({ sentence: 'Der Hund läuft weg.' }), job);
    expect(result).toMatchObject({ ok: false, reason: 'USED_DISALLOWED_WORD', detail: 'weg.' });
  });

  it('accepts a valid on-list sentence', () => {
    const result = checkSanitySentence(rawFrom({ sentence: 'Der Hund läuft schnell.' }), job);
    expect(result).toEqual({ ok: true, value: { sentence: 'Der Hund läuft schnell.' }, provider: 'GROQ' });
  });

  it('propagates the raw result provider on success', () => {
    const result = checkSanitySentence(rawFrom({ sentence: 'Der Hund läuft schnell.' }, 'OLLAMA'), job);
    expect(result).toMatchObject({ ok: true, provider: 'OLLAMA' });
  });

  it('treats an umlaut as a real letter, not a typo: "schön" on the list passes when used', () => {
    const result = checkSanitySentence(rawFrom({ sentence: 'Der Hund ist schön.' }), job);
    expect(result).toMatchObject({ ok: true });
  });

  it('does not conflate "schon" with "schön" — using the non-umlaut form when only "schön" is allowed fails', () => {
    const result = checkSanitySentence(rawFrom({ sentence: 'Der Hund ist schon da.' }), job);
    expect(result).toMatchObject({ ok: false, reason: 'USED_DISALLOWED_WORD' });
  });

  it('never throws on garbage input', () => {
    expect(() => checkSanitySentence(rawFrom(null), job)).not.toThrow();
    expect(() => checkSanitySentence(rawFrom(42), job)).not.toThrow();
    expect(() => checkSanitySentence(rawFrom(undefined), job)).not.toThrow();
  });
});

describe('normalizeGermanWord', () => {
  it('lowercases and strips punctuation while keeping umlauts and ß', () => {
    expect(normalizeGermanWord('Straße.')).toBe('straße');
    expect(normalizeGermanWord('schön,')).toBe('schön');
    expect(normalizeGermanWord('"Hund"')).toBe('hund');
  });
});
