import { normalizeGermanWord } from '@wortgarten/shared';
import type { SentenceTiming, StoryParagraph, StoryToken } from '@wortgarten/shared';
import type { EdgeTtsWordBoundary } from './edge-tts.client';

// "High fraction of word tokens got timings" per the spec — below this, per-word confidence isn't
// trustworthy enough to show as karaoke and the reader falls back to sentence-level highlighting.
const WORD_LEVEL_THRESHOLD = 0.85;

// How far to look, on either list, for the next matching word before giving up and treating the
// pair as an isolated miss — bounds the cost of resyncing after a split/joined/dropped word.
const LOOKAHEAD_WINDOW = 4;

interface FlatWordToken {
  paragraphIndex: number;
  tokenIndex: number;
  normalized: string;
}

interface WordTimingMatch {
  paragraphIndex: number;
  tokenIndex: number;
  startMs: number;
  endMs: number;
}

export interface AlignmentResult {
  matches: WordTimingMatch[];
  matchedCount: number;
  totalWordTokens: number;
}

export interface AudioSyncResult {
  audioSync: 'wordLevel' | 'sentenceLevel';
  paragraphs: StoryParagraph[];
  sentenceTimings: SentenceTiming[] | null;
}

function flattenWordTokens(paragraphs: StoryParagraph[]): FlatWordToken[] {
  const flat: FlatWordToken[] = [];
  paragraphs.forEach((paragraph, paragraphIndex) => {
    paragraph.tokens.forEach((token, tokenIndex) => {
      if (token.kind === 'word') {
        flat.push({ paragraphIndex, tokenIndex, normalized: normalizeGermanWord(token.text) });
      }
    });
  });
  return flat;
}

/**
 * Tolerant sequential match between the story's `word`-kind tokens (in reading order) and
 * edge-tts's ordered `WordBoundary` list. This is alignment, not identity resolution, but the same
 * project convention applies (see `LexemeResolver`): match by position + normalized surface,
 * walked in order, and degrade rather than guess on a miss. Never throws — edge-tts splitting or
 * joining on numbers, hyphens, or contractions is expected, not exceptional.
 */
export function alignWordTimings(paragraphs: StoryParagraph[], boundaryWords: EdgeTtsWordBoundary[]): AlignmentResult {
  const flatTokens = flattenWordTokens(paragraphs);
  const normalizedBoundaries = boundaryWords.map((w) => normalizeGermanWord(w.text));

  const matches: WordTimingMatch[] = [];
  let ti = 0;
  let bi = 0;

  while (ti < flatTokens.length && bi < normalizedBoundaries.length) {
    const token = flatTokens[ti];
    if (token.normalized.length > 0 && token.normalized === normalizedBoundaries[bi]) {
      const boundary = boundaryWords[bi];
      matches.push({
        paragraphIndex: token.paragraphIndex,
        tokenIndex: token.tokenIndex,
        startMs: boundary.offsetMs,
        endMs: boundary.offsetMs + boundary.durationMs,
      });
      ti++;
      bi++;
      continue;
    }

    // Mismatch — search a bounded window ahead on each list for the nearest resync point, and
    // skip forward on whichever side found the closer one (a split/dropped word on that side).
    let resynced = false;
    for (let window = 1; window <= LOOKAHEAD_WINDOW && !resynced; window++) {
      if (ti + window < flatTokens.length && flatTokens[ti + window].normalized === normalizedBoundaries[bi]) {
        ti += window;
        resynced = true;
      } else if (bi + window < normalizedBoundaries.length && token.normalized === normalizedBoundaries[bi + window]) {
        bi += window;
        resynced = true;
      }
    }

    if (!resynced) {
      // No nearby resync point — treat this pair as an isolated, unrecoverable miss and move on
      // rather than stalling the whole alignment over one word.
      ti++;
      bi++;
    }
  }

  return { matches, matchedCount: matches.length, totalWordTokens: flatTokens.length };
}

interface SentenceSpan {
  paragraphIndex: number;
  startTokenIndex: number;
  endTokenIndex: number;
  wordTokenIndices: number[];
}

/** Splits each paragraph into sentence spans on `.`/`!`/`?`/`…` punct tokens (each its own token,
 * per `segmentText`'s convention), always closing out the final span even with no trailing
 * punctuation. Spans with no word tokens at all (e.g. a run of punctuation) are dropped. */
function deriveSentenceSpans(paragraphs: StoryParagraph[]): SentenceSpan[] {
  const spans: SentenceSpan[] = [];

  paragraphs.forEach((paragraph, paragraphIndex) => {
    let startTokenIndex = 0;
    let wordTokenIndices: number[] = [];

    paragraph.tokens.forEach((token, tokenIndex) => {
      if (token.kind === 'word') wordTokenIndices.push(tokenIndex);

      const isSentenceEnd = token.kind === 'punct' && /[.!?…]/.test(token.text);
      const isLastToken = tokenIndex === paragraph.tokens.length - 1;

      if (isSentenceEnd || isLastToken) {
        if (wordTokenIndices.length > 0) {
          spans.push({ paragraphIndex, startTokenIndex, endTokenIndex: tokenIndex, wordTokenIndices });
        }
        startTokenIndex = tokenIndex + 1;
        wordTokenIndices = [];
      }
    });
  });

  return spans;
}

function withTiming(token: StoryToken, startMs: number | null, endMs: number | null): StoryToken {
  return { ...token, audioStartMs: startMs, audioEndMs: endMs };
}

/**
 * Runs `alignWordTimings` and decides word-level vs. sentence-level based on match confidence —
 * never throws either way. Word-level attaches `audioStartMs`/`audioEndMs` directly onto matched
 * tokens (unmatched `word` tokens, and every `punct`/`space` token, stay null). Sentence-level
 * derives a start/end per sentence from whatever timings *did* match inside it, and linearly
 * interpolates (by word position over total spoken duration) for any sentence with zero matches —
 * always produces numbers, so the reader can always highlight the current line.
 */
export function buildAudioSync(paragraphs: StoryParagraph[], boundaryWords: EdgeTtsWordBoundary[]): AudioSyncResult {
  const { matches, matchedCount, totalWordTokens } = alignWordTimings(paragraphs, boundaryWords);
  const matchRatio = totalWordTokens === 0 ? 1 : matchedCount / totalWordTokens;

  if (matchRatio >= WORD_LEVEL_THRESHOLD) {
    const matchByKey = new Map(matches.map((m) => [`${m.paragraphIndex}:${m.tokenIndex}`, m]));
    const updatedParagraphs = paragraphs.map((paragraph, paragraphIndex) => ({
      tokens: paragraph.tokens.map((token, tokenIndex) => {
        if (token.kind !== 'word') return token;
        const match = matchByKey.get(`${paragraphIndex}:${tokenIndex}`);
        return withTiming(token, match?.startMs ?? null, match?.endMs ?? null);
      }),
    }));
    return { audioSync: 'wordLevel', paragraphs: updatedParagraphs, sentenceTimings: null };
  }

  const flatTokens = flattenWordTokens(paragraphs);
  const globalWordIndex = new Map(flatTokens.map((t, i) => [`${t.paragraphIndex}:${t.tokenIndex}`, i]));
  const matchByKey = new Map(matches.map((m) => [`${m.paragraphIndex}:${m.tokenIndex}`, m]));
  const lastBoundary = boundaryWords[boundaryWords.length - 1];
  const totalDurationMs = lastBoundary ? lastBoundary.offsetMs + lastBoundary.durationMs : 0;
  const totalWords = Math.max(flatTokens.length, 1);

  const spans = deriveSentenceSpans(paragraphs);
  const sentenceTimings: SentenceTiming[] = spans.map((span) => {
    const spanMatches = span.wordTokenIndices
      .map((tokenIndex) => matchByKey.get(`${span.paragraphIndex}:${tokenIndex}`))
      .filter((m): m is WordTimingMatch => m !== undefined);

    if (spanMatches.length > 0) {
      return {
        paragraphIndex: span.paragraphIndex,
        startTokenIndex: span.startTokenIndex,
        endTokenIndex: span.endTokenIndex,
        startMs: Math.min(...spanMatches.map((m) => m.startMs)),
        endMs: Math.max(...spanMatches.map((m) => m.endMs)),
      };
    }

    // No matched word anywhere in this sentence — interpolate proportionally from its position
    // among all word tokens over the total spoken duration, rather than leaving it un-highlightable.
    const firstIndex = globalWordIndex.get(`${span.paragraphIndex}:${span.wordTokenIndices[0]}`) ?? 0;
    const lastIndex = globalWordIndex.get(`${span.paragraphIndex}:${span.wordTokenIndices[span.wordTokenIndices.length - 1]}`) ?? firstIndex;
    return {
      paragraphIndex: span.paragraphIndex,
      startTokenIndex: span.startTokenIndex,
      endTokenIndex: span.endTokenIndex,
      startMs: (firstIndex / totalWords) * totalDurationMs,
      endMs: ((lastIndex + 1) / totalWords) * totalDurationMs,
    };
  });

  // Sentence-level tokens carry no per-word timing — the reader highlights the whole span instead.
  const updatedParagraphs = paragraphs.map((paragraph) => ({
    tokens: paragraph.tokens.map((token) => (token.kind === 'word' ? withTiming(token, null, null) : token)),
  }));

  return { audioSync: 'sentenceLevel', paragraphs: updatedParagraphs, sentenceTimings };
}
