// Proper nouns (mostly Tatoeba's recurring sentence subjects — "Tom", "Mary", etc.) that a
// learner isn't expected to have in the dictionary but shouldn't disqualify an otherwise-good
// sentence.
//
// Built as a data step, not guessed: `pnpm --filter @wortgarten/seed run seed:examples -- --source
// tatoeba` prints the top 50 tokens that resolve to no seeded lexeme, by frequency. Names are
// obvious in that list — add them here, then re-run. Capitalization mid-sentence carries no
// signal in German (every noun is capitalized), so this can't be a heuristic; it has to be this
// explicit, committed list. Matched case-insensitively (folded) against the raw token.
// Built from the real top-50 unresolved-token report (`seed:examples --source tatoeba`), keeping
// only genuine proper nouns — recurring Tatoeba character names and place names, all correctly
// excluded from the dictionary by 1-filter.ts's `pos === 'name'` rejection. Deliberately excludes
// real vocabulary gaps that showed up in the same report (e.g. "sich", "Fahrrad", "Bahnhof") —
// those are words a learner should be able to collect; a sentence using one correctly stays
// non-well-formed until the seeded dictionary actually covers it, rather than being papered over.
export const PROPER_NOUN_ALLOWLIST = new Set<string>(
  [
    'Tom',
    'Toms',
    'Mary',
    'Marias',
    'Boston',
    'Johannes',
    'Australien',
    'Sami',
    'Japan',
    'Elke',
    'Deutschland',
    'John',
    'Vereinigten',
    'Paris',
    'London',
    'Amerika',
    'Tatoeba',
    'Ziri',
  ].map((s: string) => s.toLowerCase()),
);

export function isAllowlistedProperNoun(surface: string): boolean {
  return PROPER_NOUN_ALLOWLIST.has(surface.toLowerCase());
}
