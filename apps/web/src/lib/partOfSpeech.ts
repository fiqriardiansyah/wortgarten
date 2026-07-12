import type { PartOfSpeech } from '@wortgarten/shared';

export const partOfSpeechLabel: Record<PartOfSpeech, string> = {
  NOUN: 'noun',
  VERB: 'verb',
  ADJECTIVE: 'adjective',
  ADVERB: 'adverb',
  PRONOUN: 'pronoun',
  PREPOSITION: 'preposition',
  CONJUNCTION: 'conjunction',
  ARTICLE: 'article',
  NUMERAL: 'numeral',
  PARTICLE: 'particle',
  OTHER: 'word',
};
