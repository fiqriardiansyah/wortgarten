import { foldForLookup, normalizeInput } from './text';
import { tokenizeWithOffsets, type TokenSpan } from './tokenizer';
import type { PartOfSpeech } from './lexeme';

const PLAIN_CLAUSE_BOUNDARY = /[,;.!?]/;
const DIGIT = /[0-9]/;

/**
 * True at a genuine clause-boundary character. Comma/semicolon/terminal punctuation always count.
 * Colon is conditional: tokens are letters-only (see WORD_PATTERN in tokenizer.ts), so the "gap"
 * between two word tokens can contain non-linguistic content the tokenizer skipped over entirely —
 * a colon shows up there constantly as plain time notation ("gegen 7:30 Uhr") or a ratio, never a
 * real clause boundary (verified live: "Bitte rufen Sie mich gegen 7:30 Uhr an." failed to merge
 * into "anrufen" when colon was treated as an unconditional boundary). But a colon genuinely
 * introducing a clause ("Egal, was Maria trägt: sie sieht immer toll aus.") IS a real boundary, and
 * dropping colon entirely broke that case instead (a pending candidate from "trägt" survived across
 * it and stole the sentence's real "aus" from "sieht"). The distinguishing signal: time/ratio
 * notation has a digit on both sides of the colon; a clause-introducing colon never does.
 */
function isClauseBoundaryChar(text: string, index: number): boolean {
  const ch = text[index];
  if (PLAIN_CLAUSE_BOUNDARY.test(ch)) return true;
  if (ch !== ':') return false;
  const before = text[index - 1];
  const after = text[index + 1];
  return !(before !== undefined && DIGIT.test(before) && after !== undefined && DIGIT.test(after));
}

/**
 * Token indices that sit at the end of their clause — immediately followed (after only
 * whitespace) by a comma/semicolon/terminal punctuation (or a non-time-notation colon), or the
 * last token in the text. A separated German verb prefix always lands here ("Ich rufe dich
 * **an**."); a preposition governing an object never does ("Ich denke **an** dich." — "an" is
 * followed by "dich"). This single positional test is what tells the two apart.
 *
 * `text` must be the same string `spans` was computed against (i.e. already `normalizeInput`-ed,
 * or pass the same raw text to both this and `tokenizeWithOffsets`).
 */
export function clauseFinalTokenIndices(text: string, spans: TokenSpan[]): Set<number> {
  const normalized = normalizeInput(text);
  const result = new Set<number>();
  for (let i = 0; i < spans.length; i++) {
    const next = spans[i + 1];
    if (!next) {
      result.add(i);
      continue;
    }
    let boundary = false;
    for (let idx = spans[i].end; idx < next.start; idx++) {
      if (isClauseBoundaryChar(normalized, idx)) {
        boundary = true;
        break;
      }
    }
    if (boundary) result.add(i);
  }
  return result;
}

/**
 * A WordForm's raw tags say whether the surface that matched can trigger a separable-verb
 * reassembly scan. Participles never separate from their prefix — they arrive already joined
 * ("angerufen") — so a bare-stem row genuinely tagged `participle` must never seed one.
 *
 * Infinitive/bare-lemma rows are deliberately NOT excluded, even though a true infinitive
 * shouldn't separate either: German orthography already makes that safe on its own. A separable
 * verb's own infinitive is always spelled fused ("anrufen", one token) — it can never surface as
 * the bare stem token ("rufen") this check is even asked about. The one bare-stem reading that
 * legitimately EXCLUDES the base verb's own infinitive tag is the polite ("Sie") imperative
 * ("Rufen Sie mich an!") — genuinely finite, V2, must separate — which is orthographically
 * identical to the infinitive for every German verb. kaikki's conjugation tables don't tag it as a
 * distinct row (verified live: "atmen"/"rufen" have only `lemma`/`infinitive`-tagged rows for
 * their bare spelling, no separate imperative one), so excluding infinitive-tagged rows here would
 * silently drop this — common — sentence pattern instead of the rare one it was meant to guard.
 *
 * `undefined` (no tags recorded — e.g. hand-built test fixtures) defaults to eligible rather than
 * silently blocking every merge just because the caller didn't wire tag data through.
 */
export function isFiniteVerbForm(rawTags?: string[] | null): boolean {
  if (!rawTags) return true;
  return !rawTags.includes('participle');
}

export interface SeparableLexemeLike {
  lemma: string;
  partOfSpeech: PartOfSpeech;
  separablePrefix: string | null;
}

export interface SeparableMatchLike {
  lexeme: SeparableLexemeLike;
  /** Whether the WordForm row that produced this match is a finite (conjugated) reading. */
  isFiniteForm: boolean;
}

export interface SentenceSlot<TMatch> {
  tokens: string[];
  tokenIndices: number[];
  matches: TMatch[];
  unknown: boolean;
}

interface PendingSeparable<TMatch> {
  resultIndex: number;
  tokenIndex: number;
  match: TMatch;
}

/**
 * Resolves every token of a sentence, reassembling German separable verbs into one slot.
 *
 * A finite base-verb match (e.g. "rufe" matching "anrufen", separablePrefix "an") queues one
 * pending candidate per separable-prefix match it has. If a LATER token in the same clause folds
 * to exactly that prefix and is itself clause-final, the two tokens collapse into a single slot
 * carrying just that one match — the lexeme is certain once the prefix confirms it. Crossing a
 * clause boundary (see `clauseFinalTokenIndices`) drops whatever's still pending: a separated
 * prefix never reaches across a comma or sentence break into the next clause's verb.
 *
 * `clauseFinalIndices` is optional: omit it (no source text/offsets available — e.g. a bare token
 * array with no positional information) and the merge runs unguarded, matching the pre-guard
 * behavior. Supply it whenever real text is available; it's the only thing standing between
 * "Ich rufe dich an." (merges) and "Ich denke an dich." (must not).
 */
export async function resolveSeparableSentence<TMatch extends SeparableMatchLike>(
  tokens: string[],
  resolve: (token: string, index: number) => TMatch[] | Promise<TMatch[]>,
  clauseFinalIndices?: Set<number>,
): Promise<SentenceSlot<TMatch>[]> {
  const results: SentenceSlot<TMatch>[] = [];
  let pendingVerbs: PendingSeparable<TMatch>[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const folded = foldForLookup(token);
    const isClauseFinal = clauseFinalIndices ? clauseFinalIndices.has(i) : true;

    const pendingIndex = isClauseFinal
      ? pendingVerbs.findIndex((p) => p.match.lexeme.separablePrefix != null && foldForLookup(p.match.lexeme.separablePrefix) === folded)
      : -1;

    if (pendingIndex !== -1) {
      const pending = pendingVerbs[pendingIndex];
      results[pending.resultIndex] = {
        tokens: [tokens[pending.tokenIndex], token],
        tokenIndices: [pending.tokenIndex, i],
        matches: [pending.match],
        unknown: false,
      };
      // Once ANY candidate for this slot resolves, the slot is taken — drop every other
      // pending candidate sharing it so an unrelated later prefix can't clobber it.
      pendingVerbs = pendingVerbs.filter((p) => p.resultIndex !== pending.resultIndex);
    } else {
      const matches = await resolve(token, i);
      const resultIndex = results.length;
      results.push({ tokens: [token], tokenIndices: [i], matches, unknown: matches.length === 0 });

      // A prior version of this gate only queued a separable-verb candidate when the token's own
      // top-ranked match was itself a verb — meant to stop a rare verb-homograph of a common
      // adverb/adjective (e.g. "Gleich" also being an incidental form of "ausgleichen") from
      // stealing a later clause-final prefix that belonged to a different, later verb. Measured on
      // real data it was a net loss: it fixed that narrow case but broke the more common one — two
      // genuinely distinct verbs in the same clause each coincidentally having a separable sibling
      // with the SAME prefix (e.g. "Er stand da und sah mich an." — "stand" has "anstehen", "sah"
      // has "ansehen"; both are real verb readings, so the gate let "stand" win the race for "an"
      // and starve "ansehen" of a sentence it should own). No cheap positional signal distinguishes
      // the two cases, so this stays unguarded — first-queued-wins, same as the original design.
      for (const match of matches) {
        if (match.lexeme.partOfSpeech === 'VERB' && match.lexeme.separablePrefix && match.isFiniteForm) {
          pendingVerbs.push({ resultIndex, tokenIndex: i, match });
        }
      }
    }

    // A clause just closed — nothing left pending can validly complete across it (a separated
    // prefix never crosses a clause boundary), guarded only when we actually know where clauses
    // end (unguarded callers keep the old cross-position behavior).
    if (clauseFinalIndices && isClauseFinal) pendingVerbs = [];
  }

  return results;
}
