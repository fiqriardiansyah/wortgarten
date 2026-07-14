import { normalizeInput } from './text';

// Letters + combining marks, with intra-word hyphens kept (e.g. "E-Mail").
// Everything else (whitespace, punctuation) is a delimiter, not a token.
const WORD_PATTERN = /[\p{L}\p{M}]+(?:-[\p{L}\p{M}]+)*/gu;

/** Deterministic German tokenizer. Preserves casing — German capitalizes nouns. */
export function tokenize(sentence: string): string[] {
  return normalizeInput(sentence).match(WORD_PATTERN) ?? [];
}

export interface TokenSpan {
  token: string;
  start: number;
  end: number;
}

/** Same tokenization as `tokenize`, but with character offsets into the normalized text —
 * lets a caller reconstruct the original text with per-token highlights. */
export function tokenizeWithOffsets(sentence: string): TokenSpan[] {
  const normalized = normalizeInput(sentence);
  const pattern = new RegExp(WORD_PATTERN.source, WORD_PATTERN.flags);
  const spans: TokenSpan[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(normalized))) {
    spans.push({ token: match[0], start: match.index, end: match.index + match[0].length });
  }
  return spans;
}
