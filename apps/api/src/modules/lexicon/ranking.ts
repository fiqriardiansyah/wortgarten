import type { PartOfSpeech } from '@wortgarten/database';
import { foldForLookup } from '@wortgarten/shared';

export interface RankingContext {
  /** The raw surface as it appeared in the input — casing preserved, not yet folded. */
  surface: string;
  /** True when this surface is the first word of its sentence — capitalization there is a spelling
   * convention, not evidence of nounhood, so the casing signal below must be suppressed. */
  isSentenceStart?: boolean;
}

interface RankableLexeme {
  lemma: string;
  partOfSpeech: PartOfSpeech;
  frequencyRank: number | null;
}

interface RankableSense {
  translation: string;
}

// Content/function words a learner actually meets first; OTHER (marginal/unclassified entries) last.
const POS_PLAUSIBILITY_ORDER: PartOfSpeech[] = [
  'VERB',
  'NOUN',
  'ADJECTIVE',
  'ADVERB',
  'PRONOUN',
  'PREPOSITION',
  'CONJUNCTION',
  'ARTICLE',
  'NUMERAL',
  'PARTICLE',
  'OTHER',
];

/** The surface IS the lexeme's dictionary form, not merely one of its inflections (heute vs heuen's "ich heute"). */
export function isLemmaMatch(surface: string, lemma: string): boolean {
  return foldForLookup(surface) === foldForLookup(lemma);
}

// The dictionary itself flags some lexemes as pure spelling variants, not independent words (e.g.
// "wär" glossed only "alternative form of wäre") — real, found in the seeded data (82 such entries).
// Left unchecked, one of these can fold-match its own lemma and so win tier 2 below purely by being
// *a* lemma, ranking a rare spelling variant above a common word's real inflected form ("war"
// resolving to "wär" instead of "sein" the verb "to be"). Demoted ahead of every other signal, not
// just frequency: a lexeme the dictionary itself says isn't really its own word shouldn't win on
// casing or POS plausibility either.
//
// Every() on purpose, not some(): a genuinely common, polysemous lexeme can carry one narrow sense
// that cross-references a variant spelling (e.g. "er" — he/it/she/machine-it — has a 5th sense
// "alternative spelling of Er (you, polite)") without the whole lexeme being marginal. Only a lexeme
// with NO real sense of its own — every single sense is an alt-of gloss — counts.
const MARGINAL_GLOSS_PATTERN = /\balternative (form|spelling) of\b/i;

function isMarginalVariant(senses: RankableSense[]): boolean {
  return senses.length > 0 && senses.every((s) => MARGINAL_GLOSS_PATTERN.test(s.translation));
}

// German capitalizes nouns; a lowercase surface resolving to a NOUN lexeme is usually the wrong
// reading of a homograph (e.g. "park" the imperative of "parken", not "der Park"). Sentence-initial
// position is excluded: every first word is capitalized regardless of its part of speech, so casing
// there carries no information either way ("Heute" must not look noun-ish just for being capitalized).
function hasCasingPenalty(surface: string, partOfSpeech: PartOfSpeech, isSentenceStart: boolean): boolean {
  if (partOfSpeech !== 'NOUN' || isSentenceStart) return false;
  return !/^\p{Lu}/u.test(surface);
}

/**
 * Orders candidate lexemes for one surface form, most-plausible first. Never drops a candidate —
 * ambiguity is preserved, only its presentation order changes. Tiers, most to least significant:
 *
 *   0. Marginal-variant demotion: a lexeme the dictionary itself glosses as an "alternative form of"
 *      some other word is never preferred, regardless of the tiers below (the "war" vs "wär" bug).
 *   1. Casing: a lowercase surface mid-sentence outranks any NOUN reading of the same surface.
 *      Applied before lemma match because a genuine noun homograph (e.g. "Park") would otherwise
 *      always win tier 2 below purely by being its own lemma, defeating the casing signal entirely.
 *   2. Lemma match: the surface being the lexeme's own dictionary form beats it being a mere
 *      inflection of some other lexeme (the "heute" vs "heuen" bug).
 *   3. frequencyRank ascending (nulls last) — the common word beats the rare one.
 *   4. Part-of-speech plausibility — cheap tiebreak for the rare case the above all tie.
 */
export function rankLexemes<T extends { lexeme: RankableLexeme; senses?: RankableSense[] }>(
  items: T[],
  context: RankingContext,
): T[] {
  const { surface, isSentenceStart = false } = context;

  const tier = (item: T): [number, number, number, number, number] => [
    isMarginalVariant(item.senses ?? []) ? 1 : 0,
    hasCasingPenalty(surface, item.lexeme.partOfSpeech, isSentenceStart) ? 1 : 0,
    isLemmaMatch(surface, item.lexeme.lemma) ? 0 : 1,
    item.lexeme.frequencyRank ?? Infinity,
    POS_PLAUSIBILITY_ORDER.indexOf(item.lexeme.partOfSpeech),
  ];

  return [...items].sort((a, b) => {
    const ta = tier(a);
    const tb = tier(b);
    for (let i = 0; i < ta.length; i++) {
      if (ta[i] !== tb[i]) return ta[i] - tb[i];
    }
    return 0;
  });
}
