import { describe, expect, it } from 'vitest';
import { ACCENT_COLORS, buildCoverPrompt, buildSubject, pickAccent, STORY_COVER_PROMPT_TEMPLATE } from './prompt';

describe('buildSubject', () => {
  it('keeps the first two sentences when short enough', () => {
    const translation = 'A dog runs through a park. A cat watches from a tree. Nothing else happens today.';
    expect(buildSubject(translation)).toBe('A dog runs through a park. A cat watches from a tree');
  });

  it('falls back to one sentence when two sentences exceed the cap', () => {
    const long = 'A'.repeat(100) + '.';
    const translation = `${long} A cat watches from a tree.`;
    const subject = buildSubject(translation);
    expect(subject).toBe('A'.repeat(100));
    expect(subject.length).toBeLessThanOrEqual(120);
  });

  it('hard-caps a single very long sentence at ~120 chars', () => {
    const translation = 'A'.repeat(200) + '.';
    const subject = buildSubject(translation);
    expect(subject.length).toBe(120);
  });

  it('strips trailing punctuation', () => {
    expect(buildSubject('A dog runs through a park!')).toBe('A dog runs through a park');
  });

  it('handles a translation with no terminal punctuation', () => {
    expect(buildSubject('a dog running through a park')).toBe('a dog running through a park');
  });
});

describe('pickAccent', () => {
  it('is deterministic for the same story id', () => {
    expect(pickAccent('story-123')).toBe(pickAccent('story-123'));
  });

  it('only ever returns a real ACCENT_COLORS entry (never coral)', () => {
    for (const id of ['a', 'b', 'c', 'story-1', 'story-2', 'xyz']) {
      expect(ACCENT_COLORS).toContain(pickAccent(id));
    }
  });
});

describe('buildCoverPrompt', () => {
  it('fills subject and accent into the fixed template', () => {
    const prompt = buildCoverPrompt({ subject: 'a dog in a park', accent: '#2BB3A3' });
    expect(prompt).toContain('a dog in a park');
    expect(prompt).toContain('#2BB3A3');
    expect(prompt).toContain('No text, no lettering, no words, no letters');
  });

  it('template contains the load-bearing no-text line', () => {
    expect(STORY_COVER_PROMPT_TEMPLATE).toContain('No text, no lettering, no words, no letters');
  });
});
