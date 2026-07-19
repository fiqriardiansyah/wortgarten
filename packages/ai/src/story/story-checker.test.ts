import { describe, expect, it } from 'vitest';
import type { AiJob, AiRawResult } from '@wortgarten/shared';
import { checkStoryDraft } from './story-checker';

function job(maxWords = 20): AiJob {
  return { type: 'STORY', allowedWords: [], maxWords };
}

function raw(json: unknown): AiRawResult {
  return { provider: 'GROQ', json, raw: JSON.stringify(json) };
}

describe('checkStoryDraft', () => {
  it('accepts a draft with a title and story body', () => {
    const result = checkStoryDraft(raw({ title: 'Der Hund', story: 'Der Hund läuft schnell.' }), job());
    expect(result.ok).toBe(true);
  });

  it('passes a provided translation through unchanged', () => {
    const result = checkStoryDraft(
      raw({ title: 'Der Hund', story: 'Der Hund läuft schnell.', translation: 'The dog runs fast.' }),
      job(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.translation).toBe('The dog runs fast.');
  });

  it('normalizes a missing translation to null rather than rejecting the draft', () => {
    const result = checkStoryDraft(raw({ title: 'Der Hund', story: 'Der Hund läuft schnell.' }), job());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.translation).toBeNull();
  });

  it('rejects malformed JSON', () => {
    const result = checkStoryDraft({ provider: 'GROQ', json: null, raw: 'not json' }, job());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('BAD_JSON');
  });

  it('rejects a draft with a blank story body', () => {
    const result = checkStoryDraft(raw({ title: 'Empty', story: '   ' }), job());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('EMPTY');
  });

  it('rejects a draft with a blank title', () => {
    const result = checkStoryDraft(raw({ title: '   ', story: 'Der Hund läuft.' }), job());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('EMPTY');
  });

  it('accepts a draft that uses words far outside any allowlist — vocabulary is never checked here', () => {
    const result = checkStoryDraft(raw({ title: 'Die Katze', story: 'Der Hund sieht die Katze im Krankenhaus.' }), job());
    expect(result.ok).toBe(true);
  });

  it('accepts a draft that blows past the target word count — length is trimmed downstream, never rejected here', () => {
    const words = new Array(50).fill('Hund').join(' ');
    const result = checkStoryDraft(raw({ title: 'Long', story: `${words}.` }), job(10));
    expect(result.ok).toBe(true);
  });
});
