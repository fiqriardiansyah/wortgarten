import type { Lexeme, Sense, WordForm } from '@wortgarten/database';

/** One dictionary entry matching a surface form: its lexeme, the form itself, and all its senses. */
export interface LexemeMatch {
  lexeme: Lexeme;
  form: WordForm;
  senses: Sense[];
}

/** The match(es) for one slot in a tokenized sentence. Two tokens for a reassembled separable verb. */
export interface SentenceTokenMatch {
  tokens: string[];
  tokenIndices: number[];
  matches: LexemeMatch[];
  unknown: boolean;
}
