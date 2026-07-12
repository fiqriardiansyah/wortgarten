export type PartOfSpeech =
  | 'NOUN'
  | 'VERB'
  | 'ADJECTIVE'
  | 'ADVERB'
  | 'PRONOUN'
  | 'PREPOSITION'
  | 'CONJUNCTION'
  | 'ARTICLE'
  | 'NUMERAL'
  | 'PARTICLE'
  | 'OTHER';

export type Gender = 'MASCULINE' | 'FEMININE' | 'NEUTER';

const ARTICLE_BY_GENDER: Record<Gender, string> = {
  MASCULINE: 'der',
  FEMININE: 'die',
  NEUTER: 'das',
};

interface DisplayFormInput {
  lemma: string;
  partOfSpeech: PartOfSpeech;
  gender?: Gender | null;
}

/** A noun is never shown bare — always with its article ("der Hund"). Everything else is just the lemma
 * (separable verbs' lemma is already the full infinitive, e.g. "anrufen" — no concatenation needed). */
export function displayForm(lexeme: DisplayFormInput): string {
  if (lexeme.partOfSpeech === 'NOUN' && lexeme.gender) {
    return `${ARTICLE_BY_GENDER[lexeme.gender]} ${lexeme.lemma}`;
  }
  return lexeme.lemma;
}

interface PluralDisplayFormInput {
  partOfSpeech: PartOfSpeech;
  plural?: string | null;
}

/** German plurals all take "die", regardless of the singular's gender. Null when not a noun or plural unknown. */
export function pluralDisplayForm(lexeme: PluralDisplayFormInput): string | null {
  if (lexeme.partOfSpeech !== 'NOUN' || !lexeme.plural) return null;
  return `die ${lexeme.plural}`;
}

/** The word detail "passport" form: "der Hund / die Hunde", falling back to the singular alone. */
export function fullDisplayForm(lexeme: DisplayFormInput & PluralDisplayFormInput): string {
  const plural = pluralDisplayForm(lexeme);
  return plural ? `${displayForm(lexeme)} / ${plural}` : displayForm(lexeme);
}

interface IsIncompleteInput {
  partOfSpeech: PartOfSpeech;
  gender?: Gender | null;
  plural?: string | null;
}

/** A noun without gender or plural is only half-learned — a property of the dictionary entry, not the user's word. */
export function isIncomplete(lexeme: IsIncompleteInput): boolean {
  return lexeme.partOfSpeech === 'NOUN' && (lexeme.gender == null || lexeme.plural == null);
}

export type LadderLevel = 'NEW' | 'RECOGNIZE' | 'RECALL' | 'PRODUCE' | 'MASTERED';

export type LadderLevelColor = 'gray' | 'purple' | 'gold';

/** Defined once, reused everywhere the 5-rung mastery ladder needs a colour (garden cards, word detail). */
export const ladderLevelColor: Record<LadderLevel, LadderLevelColor> = {
  NEW: 'gray',
  RECOGNIZE: 'purple',
  RECALL: 'purple',
  PRODUCE: 'purple',
  MASTERED: 'gold',
};

export const LADDER_LEVELS: LadderLevel[] = ['NEW', 'RECOGNIZE', 'RECALL', 'PRODUCE', 'MASTERED'];
