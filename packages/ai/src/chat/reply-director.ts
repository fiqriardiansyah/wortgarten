import type { NextReplyMode, NextReplyPlan, RustyWordHint } from '@wortgarten/shared';

// Deterministic-with-light-rotation, never a slot machine (see the iteration 2 spec): eligibility
// is a plain modulo on `turnIndex`, not a coin flip, so the same conversation always rotates the
// same way and a test can assert on it. `~1 in 3`/`~1 in 4` in the spec describe the resulting
// long-run frequency of this cadence, not a probability this code rolls.
const CHOICE_EVERY_N_TURNS = 3;
const TILES_EVERY_N_TURNS = 4;
const CHOICE_OPTION_COUNT = 3;
const TILES_MAX_BASE_WORDS = 5;
const TILES_DISTRACTOR_COUNT = 3;
const RUSTY_NUDGE_MIN_COUNT = 3;
const RUSTY_NUDGE_CAP = 3;

export interface ReplyDirectorInput {
  /** CHAT_REPLY_VARIETY off → always "type", byte-for-byte iteration 1 behaviour. */
  enabled: boolean;
  /** Already level-checked (chat-checker.ts) candidates from the turn that just landed — empty
   * on every "scripted" turn, since there's no model call to draw them from. */
  suggestedReplies: string[];
  /** Every one of the user's current rusty words (retrievability < RUSTY_THRESHOLD), pre-resolved
   * to a display form, not yet capped — the director caps it to RUSTY_NUDGE_CAP itself. */
  rustyWords: RustyWordHint[];
  /** Count of character messages already in the conversation before this one. 0 for the opening
   * message — the "very first user turn" the spec forbids ever landing on tiles. */
  turnIndex: number;
  /** mode of the immediately preceding character message's own plan, or null if there isn't one
   * yet (turnIndex === 0). Enforces "never the same non-type mode twice in a row". */
  lastMode: NextReplyMode | null;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Splits one suggested reply into its own tiles, then tops it up with known-word distractors
 * from `distractorPool` (words the user already knows — never a vocabulary wall), shuffled so
 * tapping in displayed order never trivially reconstructs the sentence. */
function buildTileWords(baseReply: string, distractorPool: string[]): string[] {
  const baseWords = baseReply.trim().split(/\s+/).filter(Boolean);
  const baseWordsLower = new Set(baseWords.map((w) => w.toLowerCase()));
  const candidates = shuffled(distractorPool.filter((w) => !baseWordsLower.has(w.toLowerCase())));
  const distractors = candidates.slice(0, TILES_DISTRACTOR_COUNT);
  return shuffled([...baseWords, ...distractors]);
}

/**
 * The reply director (Seam 1's server-side brain): decides how the user replies next, given what
 * the character just said and the reader's own rusty-word state. Plain code, no AI call — the
 * character turn already produced everything this needs (suggestedReplies), and rusty state comes
 * straight off FSRS. First rule that fits wins; falls through to plain "type" otherwise, which is
 * also the entire behaviour when `enabled` is false.
 */
export function pickNextReplyPlan(input: ReplyDirectorInput, distractorPool: string[]): NextReplyPlan {
  if (!input.enabled) return { mode: 'type' };

  const choiceEligible = input.turnIndex % CHOICE_EVERY_N_TURNS === 0 && input.lastMode !== 'choice';
  if (choiceEligible && input.suggestedReplies.length >= 2) {
    return { mode: 'choice', scaffold: { options: input.suggestedReplies.slice(0, CHOICE_OPTION_COUNT) } };
  }

  // turnIndex > 0 guards the spec's "never tiles on the very first user turn" rule directly —
  // the opening message is always turnIndex 0.
  const tilesEligible = input.turnIndex > 0 && input.turnIndex % TILES_EVERY_N_TURNS === 0 && input.lastMode !== 'tiles';
  if (tilesEligible) {
    const base = input.suggestedReplies.find((r) => wordCount(r) <= TILES_MAX_BASE_WORDS);
    if (base) {
      return { mode: 'tiles', scaffold: { tileWords: buildTileWords(base, distractorPool) } };
    }
  }

  if (input.rustyWords.length >= RUSTY_NUDGE_MIN_COUNT) {
    return { mode: 'type', scaffold: { rustyWords: input.rustyWords.slice(0, RUSTY_NUDGE_CAP) } };
  }

  return { mode: 'type' };
}
