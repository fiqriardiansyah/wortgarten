import type { Lexeme } from '@wortgarten/database';
import type { LexemeSummary } from '@wortgarten/shared';

/** Strips a full Lexeme row down to the fields the client contract needs for display. */
export function toLexemeSummary(lexeme: Lexeme): LexemeSummary {
  return {
    id: lexeme.id,
    lemma: lexeme.lemma,
    partOfSpeech: lexeme.partOfSpeech,
    gender: lexeme.gender,
    plural: lexeme.plural,
    separablePrefix: lexeme.separablePrefix,
    auxiliary: lexeme.auxiliary,
    government: lexeme.government,
    frequencyRank: lexeme.frequencyRank,
  };
}
