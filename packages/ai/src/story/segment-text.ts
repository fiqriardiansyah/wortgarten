import { normalizeInput, tokenizeWithOffsets } from '@wortgarten/shared';

export interface TextSegment {
  kind: 'word' | 'punct' | 'space';
  text: string;
  /** Index into `tokenize(text)` / `LexemeResolver.lookupSentence(text)`'s token array — only set for `word`. */
  wordIndex?: number;
}

function splitGap(gap: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let i = 0;
  while (i < gap.length) {
    if (/\s/.test(gap[i])) {
      let j = i;
      while (j < gap.length && /\s/.test(gap[j])) j++;
      segments.push({ kind: 'space', text: gap.slice(i, j) });
      i = j;
    } else {
      // Each punctuation character is its own token — matches how the frozen StoryToken fixture
      // treats adjacent punctuation (e.g. `?` and the closing `"` are two separate tokens).
      segments.push({ kind: 'punct', text: gap[i] });
      i++;
    }
  }
  return segments;
}

/**
 * Splits a paragraph's full text into word/punct/space segments whose `text` concatenates back to
 * exactly the (normalized) input — the invariant the Reader relies on (see WordPopup's
 * `paragraph.tokens.map(t => t.text).join('')`). `wordIndex` lines up 1:1 with the token indices
 * `LexemeResolver.lookupSentence` returns, as long as both are called on the same normalized text.
 */
export function segmentText(text: string): { normalized: string; segments: TextSegment[] } {
  const normalized = normalizeInput(text);
  const spans = tokenizeWithOffsets(normalized);

  const segments: TextSegment[] = [];
  let cursor = 0;
  spans.forEach((span, wordIndex) => {
    segments.push(...splitGap(normalized.slice(cursor, span.start)));
    segments.push({ kind: 'word', text: span.token, wordIndex });
    cursor = span.end;
  });
  segments.push(...splitGap(normalized.slice(cursor)));

  return { normalized, segments };
}
