import { normalizeInput } from '@wortgarten/shared';

// Letters + combining marks, with intra-word hyphens kept (e.g. "E-Mail").
// Everything else (whitespace, punctuation) is a delimiter, not a token.
const WORD_PATTERN = /[\p{L}\p{M}]+(?:-[\p{L}\p{M}]+)*/gu;

/** Deterministic German tokenizer. Preserves casing — German capitalizes nouns. */
export function tokenize(sentence: string): string[] {
  return normalizeInput(sentence).match(WORD_PATTERN) ?? [];
}
