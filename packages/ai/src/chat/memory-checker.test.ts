import { describe, expect, it } from 'vitest';
import type { AiJob, AiRawResult } from '@wortgarten/shared';
import { checkMemoryNote } from './memory-checker';

function job(maxFacts = 8): AiJob {
  return {
    type: 'CHAT_MEMORY',
    allowedWords: [],
    maxWords: 80,
    meta: { oldSummary: '', oldFacts: [], newBubbles: [], language: 'de', maxFacts },
  };
}

function raw(json: unknown): AiRawResult {
  return { provider: 'GROQ', json, raw: JSON.stringify(json) };
}

describe('checkMemoryNote', () => {
  it('accepts a well-formed draft, keeping safe facts as-is', () => {
    const result = checkMemoryNote(raw({ summary: 'You practised ordering coffee.', facts: ['likes cats', 'found the dative tricky'] }), job());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.summary).toBe('You practised ordering coffee.');
    expect(result.value.facts).toEqual(['likes cats', 'found the dative tricky']);
  });

  it('drops an unsafe fact even though the model included it, without rejecting the whole note', () => {
    const result = checkMemoryNote(raw({ summary: 'You practised ordering coffee.', facts: ['likes cats', 'my name is Anna'] }), job());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.facts).toEqual(['likes cats']);
  });

  it('strips an identifying sentence out of the summary too', () => {
    const result = checkMemoryNote(raw({ summary: 'You practised coffee. My name is Anna and I live in Berlin.', facts: [] }), job());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.summary).toBe('You practised coffee.');
  });

  it('caps facts at meta.maxFacts', () => {
    const result = checkMemoryNote(raw({ summary: '', facts: ['a', 'b', 'c', 'd'] }), job(2));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.facts).toEqual(['a', 'b']);
  });

  it('treats an all-filtered / empty result as a valid, intentionally-blank note, not EMPTY', () => {
    const result = checkMemoryNote(raw({ summary: '', facts: [] }), job());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ summary: '', facts: [] });
  });

  it('rejects malformed JSON as BAD_JSON', () => {
    const result = checkMemoryNote({ provider: 'GROQ', json: null, raw: 'not json' }, job());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('BAD_JSON');
  });

  it('rejects a draft missing the required summary field', () => {
    const result = checkMemoryNote(raw({ facts: ['likes cats'] }), job());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('BAD_JSON');
  });

  it('tolerates an omitted facts field, defaulting to none', () => {
    const result = checkMemoryNote(raw({ summary: 'You practised coffee.' }), job());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.facts).toEqual([]);
  });
});
