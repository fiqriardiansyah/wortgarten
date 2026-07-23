import { describe, expect, it } from 'vitest';
import type { StoryParagraph } from '@wortgarten/shared';
import { alignWordTimings, buildAudioSync } from './align';
import type { EdgeTtsWordBoundary } from './edge-tts.client';

function word(text: string) {
  return { text, kind: 'word' as const, lexemeId: null, senseId: null, status: 'known' as const };
}
function punct(text: string) {
  return { text, kind: 'punct' as const, lexemeId: null, senseId: null, status: 'function' as const };
}
function space() {
  return { text: ' ', kind: 'space' as const, lexemeId: null, senseId: null, status: 'function' as const };
}

function boundary(text: string, offsetMs: number, durationMs: number): EdgeTtsWordBoundary {
  return { text, offsetMs, durationMs };
}

describe('alignWordTimings', () => {
  it('matches a clean 1:1 story against its boundary list', () => {
    const paragraphs: StoryParagraph[] = [
      { tokens: [word('Der'), space(), word('Hund'), space(), word('läuft'), punct('.')] },
    ];
    const boundaries = [boundary('Der', 0, 200), boundary('Hund', 200, 300), boundary('läuft', 500, 300)];

    const result = alignWordTimings(paragraphs, boundaries);

    expect(result.totalWordTokens).toBe(3);
    expect(result.matchedCount).toBe(3);
    expect(result.matches).toEqual([
      { paragraphIndex: 0, tokenIndex: 0, startMs: 0, endMs: 200 },
      { paragraphIndex: 0, tokenIndex: 2, startMs: 200, endMs: 500 },
      { paragraphIndex: 0, tokenIndex: 4, startMs: 500, endMs: 800 },
    ]);
  });

  it('is case/punctuation-insensitive (edge-tts strips trailing punctuation)', () => {
    const paragraphs: StoryParagraph[] = [{ tokens: [word('Hund'), punct('.')] }];
    const boundaries = [boundary('hund', 0, 300)];

    const result = alignWordTimings(paragraphs, boundaries);
    expect(result.matchedCount).toBe(1);
  });

  it('resyncs after edge-tts drops a word (e.g. collapses a hyphenated compound)', () => {
    const paragraphs: StoryParagraph[] = [
      { tokens: [word('Vor'), space(), word('lesen'), space(), word('macht'), space(), word('Spaß'), punct('.')] },
    ];
    // "Vor" and "lesen" got fused into one spoken word "Vorlesen" — never matches either token.
    const boundaries = [boundary('Vorlesen', 0, 400), boundary('macht', 400, 200), boundary('Spaß', 600, 300)];

    const result = alignWordTimings(paragraphs, boundaries);

    // "Vor" and "lesen" stay unmatched, but alignment recovers for the rest of the sentence.
    expect(result.matches.find((m) => m.tokenIndex === 4)).toEqual({ paragraphIndex: 0, tokenIndex: 4, startMs: 400, endMs: 600 });
    expect(result.matches.find((m) => m.tokenIndex === 6)).toEqual({ paragraphIndex: 0, tokenIndex: 6, startMs: 600, endMs: 900 });
    expect(result.matchedCount).toBe(2);
    expect(result.totalWordTokens).toBe(4);
  });

  it('resyncs after edge-tts splits a word edge-tts never emitted', () => {
    const paragraphs: StoryParagraph[] = [{ tokens: [word('Apfelsaft'), space(), word('bitte'), punct('.')] }];
    // edge-tts spoke it as two words instead of one.
    const boundaries = [boundary('Apfel', 0, 200), boundary('saft', 200, 200), boundary('bitte', 400, 300)];

    const result = alignWordTimings(paragraphs, boundaries);

    expect(result.matches.find((m) => m.tokenIndex === 2)).toEqual({ paragraphIndex: 0, tokenIndex: 2, startMs: 400, endMs: 700 });
    expect(result.totalWordTokens).toBe(2);
  });

  it('never throws on a completely empty boundary list', () => {
    const paragraphs: StoryParagraph[] = [{ tokens: [word('Hallo'), punct('!')] }];
    const result = alignWordTimings(paragraphs, []);
    expect(result.matchedCount).toBe(0);
    expect(result.totalWordTokens).toBe(1);
  });

  it('never throws on an empty story', () => {
    const result = alignWordTimings([], [boundary('Hallo', 0, 100)]);
    expect(result.matchedCount).toBe(0);
    expect(result.totalWordTokens).toBe(0);
  });
});

describe('buildAudioSync', () => {
  it('produces wordLevel sync when alignment confidence is high', () => {
    const paragraphs: StoryParagraph[] = [
      { tokens: [word('Der'), space(), word('Hund'), space(), word('läuft'), punct('.')] },
    ];
    const boundaries = [boundary('Der', 0, 200), boundary('Hund', 200, 300), boundary('läuft', 500, 300)];

    const result = buildAudioSync(paragraphs, boundaries);

    expect(result.audioSync).toBe('wordLevel');
    expect(result.sentenceTimings).toBeNull();
    const tokens = result.paragraphs[0].tokens;
    expect(tokens[0]).toMatchObject({ text: 'Der', audioStartMs: 0, audioEndMs: 200 });
    expect(tokens[2]).toMatchObject({ text: 'Hund', audioStartMs: 200, audioEndMs: 500 });
    expect(tokens[4]).toMatchObject({ text: 'läuft', audioStartMs: 500, audioEndMs: 800 });
  });

  it('falls back to sentenceLevel and never throws when alignment confidence is low', () => {
    const paragraphs: StoryParagraph[] = [
      {
        tokens: [
          word('Der'), space(), word('Hund'), space(), word('läuft'), punct('.'), space(),
          word('Er'), space(), word('ist'), space(), word('froh'), punct('.'),
        ],
      },
    ];
    // Wildly different text — almost nothing will match.
    const boundaries = [boundary('Katzen', 0, 300), boundary('mögen', 300, 300), boundary('Fisch', 600, 300)];

    const result = buildAudioSync(paragraphs, boundaries);

    expect(result.audioSync).toBe('sentenceLevel');
    expect(result.sentenceTimings).not.toBeNull();
    expect(result.sentenceTimings!.length).toBe(2);
    // Every span produces real, ordered, non-negative numbers even with zero matches inside it.
    for (const span of result.sentenceTimings!) {
      expect(span.startMs).toBeGreaterThanOrEqual(0);
      expect(span.endMs).toBeGreaterThan(span.startMs);
    }
    expect(result.sentenceTimings![0].endMs).toBeLessThanOrEqual(result.sentenceTimings![1].startMs + 1);
    // Word tokens carry no per-word timing in sentence-level mode.
    for (const token of result.paragraphs[0].tokens) {
      if (token.kind === 'word') expect(token.audioStartMs).toBeNull();
    }
  });

  it('never throws with zero boundary words at all', () => {
    const paragraphs: StoryParagraph[] = [{ tokens: [word('Hallo'), space(), word('Welt'), punct('!')] }];
    const result = buildAudioSync(paragraphs, []);

    expect(result.audioSync).toBe('sentenceLevel');
    expect(result.sentenceTimings).toEqual([{ paragraphIndex: 0, startTokenIndex: 0, endTokenIndex: 3, startMs: 0, endMs: 0 }]);
  });

  it('never throws on an empty story', () => {
    const result = buildAudioSync([], []);
    expect(result.audioSync).toBe('wordLevel');
    expect(result.paragraphs).toEqual([]);
    expect(result.sentenceTimings).toBeNull();
  });
});
