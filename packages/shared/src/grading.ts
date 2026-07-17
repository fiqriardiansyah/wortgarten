import { displayForm, type Gender } from './lexeme';
import { foldUmlautsOnly } from './text';
import type {
  AttemptResult,
  BuildSentenceSolution,
  Correction,
  DrillTaskType,
  PickMeaningSolution,
  PlanItem,
  TypeWordSolution,
} from './session-types';

// ─── The Part 5 matrix — single source of truth for both SrsService (fsrsRating)
// and the session grading/plan logic (ladderAction, requeue). Client and server
// import the same const, so they cannot drift.

export type LadderAction = 'climb' | 'hold' | 'drop';

/** Structurally identical to @wortgarten/database's Prisma `FsrsRating` enum — duplicated as a
 * plain union so packages/shared has no dependency on the database package. */
export type FsrsRating = 'AGAIN' | 'HARD' | 'GOOD' | 'EASY';

export interface GradingMatrixEntry {
  ladderAction: LadderAction;
  /** Base FSRS rating. CORRECT is upgraded to EASY by the caller when the task is
   * PICK_MEANING and the response was fast — see SrsService.mapToRating. */
  fsrsRating: FsrsRating;
  requeue: boolean;
}

export const GRADING_MATRIX: Record<AttemptResult, GradingMatrixEntry> = {
  CORRECT: { ladderAction: 'climb', fsrsRating: 'GOOD', requeue: false },
  CORRECT_WITH_TYPO: { ladderAction: 'climb', fsrsRating: 'HARD', requeue: false },
  MISSING_UMLAUT: { ladderAction: 'hold', fsrsRating: 'HARD', requeue: true },
  MISSING_ARTICLE: { ladderAction: 'hold', fsrsRating: 'HARD', requeue: true },
  WRONG_GENDER: { ladderAction: 'hold', fsrsRating: 'HARD', requeue: true },
  WRONG_FORM: { ladderAction: 'hold', fsrsRating: 'HARD', requeue: true },
  WRONG_MEANING: { ladderAction: 'drop', fsrsRating: 'AGAIN', requeue: true },
  EMPTY: { ladderAction: 'hold', fsrsRating: 'AGAIN', requeue: true },
};

// ─── Small pure helpers ───────────────────────────────────────────────────────

/** Classic DP edit distance — small strings only (word-length inputs). */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let curr = new Array<number>(n + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function normalizeTyped(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

const ARTICLES = ['der', 'die', 'das'];
const ARTICLE_BY_GENDER: Record<Gender, string> = { MASCULINE: 'der', FEMININE: 'die', NEUTER: 'das' };
const GENDER_WORD: Record<Gender, string> = { MASCULINE: 'masculine', FEMININE: 'feminine', NEUTER: 'neuter' };

// ─── PICK_MEANING ─────────────────────────────────────────────────────────────

export function gradePickMeaning(input: { chosenSenseId: string | null; correctSenseId: string }): AttemptResult {
  if (!input.chosenSenseId) return 'EMPTY';
  return input.chosenSenseId === input.correctSenseId ? 'CORRECT' : 'WRONG_MEANING';
}

// ─── BUILD_SENTENCE ───────────────────────────────────────────────────────────

export function gradeBuildSentence(input: { submittedTileIds: string[]; correctTileOrder: string[] }): AttemptResult {
  if (input.submittedTileIds.length === 0) return 'EMPTY';
  const { submittedTileIds: a, correctTileOrder: b } = input;
  if (a.length === b.length && a.every((id, i) => id === b[i])) return 'CORRECT';
  return 'WRONG_FORM';
}

// ─── TYPE_WORD ────────────────────────────────────────────────────────────────

/** One lexeme a piece of typed text resolves to, ranked-top-candidate shape (from LookupService). */
export interface LexemeResolution {
  lexemeId: string;
  senseId: string;
  lemma: string;
  translation: string;
}

export interface TypeWordGradeResult {
  result: AttemptResult;
  /** Set only for MISSING_UMLAUT, when the user's literal (wrong) spelling is itself a real,
   * different dictionary word — the "schon vs schön" teaching moment. */
  umlautContrast?: { typedWord: string; typedTranslation: string };
}

const FAST_TYPO_MIN_LENGTH = 4;

/**
 * Grading pipeline for TYPE_WORD, in spec order — first match wins. Steps 1-6 are pure/sync;
 * steps 7-8 (same-lexeme-different-form vs different-lexeme) need a dictionary lookup, injected
 * via `resolveLexeme` so this module stays free of any DB dependency (the API wires it to
 * LookupService.lookupForm; a browser-side PWA build could inject a different implementation later).
 */
export async function gradeTypeWord(
  typedRaw: string,
  solution: TypeWordSolution,
  resolveLexeme: (text: string) => Promise<LexemeResolution[]>,
): Promise<TypeWordGradeResult> {
  const typed = normalizeTyped(typedRaw);
  if (!typed) return { result: 'EMPTY' };

  const isNoun = solution.partOfSpeech === 'NOUN' && solution.gender != null;
  const expectedFull = displayForm({ lemma: solution.lemma, partOfSpeech: solution.partOfSpeech, gender: solution.gender });

  // 2. exact match
  if (typed === expectedFull) return { result: 'CORRECT' };

  if (isNoun) {
    const correctArticle = ARTICLE_BY_GENDER[solution.gender as Gender];

    // 3. correct body, no article at all
    if (typed === solution.lemma) return { result: 'MISSING_ARTICLE' };

    // 4. correct body, wrong article
    for (const article of ARTICLES) {
      if (article !== correctArticle && typed === `${article} ${solution.lemma}`) {
        return { result: 'WRONG_GENDER' };
      }
    }
  }

  // 5. umlaut/ß fold match (case-sensitive otherwise, so a plain-case typo falls through to step 6)
  if (foldUmlautsOnly(typed) === foldUmlautsOnly(expectedFull)) {
    const matches = await resolveLexeme(typed);
    // Must be the literal word they typed, not merely "some other lexeme" — a lookup on the folded
    // surface can also return OTHER homographs of the target's own spelling (e.g. a second "schön"
    // entry), which would contrast the target against itself instead of against what was typed.
    const differentReal = matches.find((m) => m.lexemeId !== solution.lexemeId && m.lemma.toLowerCase() === typed.toLowerCase());
    return differentReal
      ? { result: 'MISSING_UMLAUT', umlautContrast: { typedWord: differentReal.lemma, typedTranslation: differentReal.translation } }
      : { result: 'MISSING_UMLAUT' };
  }

  // 6. small typo (also catches a lowercase German noun, e.g. "der hund")
  if (levenshtein(typed, expectedFull) <= 1 && expectedFull.length >= FAST_TYPO_MIN_LENGTH) {
    return { result: 'CORRECT_WITH_TYPO' };
  }

  // 7-8. resolve via the dictionary — same lexeme (different form) vs a different lexeme/nothing
  const matches = await resolveLexeme(typed);
  if (matches.some((m) => m.lexemeId === solution.lexemeId)) return { result: 'WRONG_FORM' };
  return { result: 'WRONG_MEANING' };
}

// ─── Correction (Part 6) — pure, template-driven, never AI ───────────────────

export interface CorrectionContext {
  umlautContrast?: { typedWord: string; typedTranslation: string };
}

/** Builds the in-place correction card content. Never called for `CORRECT`. */
export function buildCorrection(item: PlanItem, result: AttemptResult, context: CorrectionContext = {}): Correction {
  if (item.taskType === 'PICK_MEANING') {
    const solution = item.solution as PickMeaningSolution;
    if (result === 'EMPTY') {
      return { correctAnswer: solution.correctLabel, tip: `You left it blank — it's "${solution.correctLabel}".` };
    }
    // WRONG_MEANING: the only other reachable result for PICK_MEANING
    return { correctAnswer: solution.correctLabel, tip: solution.correctLabel };
  }

  if (item.taskType === 'TYPE_WORD') {
    const solution = item.solution as TypeWordSolution;
    const isNoun = solution.partOfSpeech === 'NOUN' && solution.gender != null;
    const expectedFull = displayForm({ lemma: solution.lemma, partOfSpeech: solution.partOfSpeech, gender: solution.gender });
    const correctArticle = solution.gender ? ARTICLE_BY_GENDER[solution.gender] : undefined;

    switch (result) {
      case 'MISSING_ARTICLE':
        return {
          correctAnswer: expectedFull,
          emphasize: correctArticle,
          tip: `Nouns always travel with their article: **${correctArticle}** ${solution.lemma}.`,
        };
      case 'WRONG_GENDER':
        return {
          correctAnswer: expectedFull,
          emphasize: solution.lemma,
          tip: `**${solution.lemma}** is ${GENDER_WORD[solution.gender as Gender]} — it always takes *${correctArticle}*.`,
        };
      case 'MISSING_UMLAUT':
        return {
          correctAnswer: expectedFull,
          emphasize: solution.lemma,
          tip: context.umlautContrast
            ? `*${context.umlautContrast.typedWord}* means '${context.umlautContrast.typedTranslation}' — you wanted **${solution.lemma}** (${solution.translation}).`
            : `Don't forget the umlaut: **${solution.lemma}**.`,
        };
      case 'WRONG_FORM':
        return {
          correctAnswer: expectedFull,
          emphasize: solution.lemma,
          tip: `Same word, different form. Here you need: **${solution.lemma}**.`,
        };
      case 'WRONG_MEANING':
        return { correctAnswer: expectedFull, tip: solution.translation };
      case 'CORRECT_WITH_TYPO':
        return { correctAnswer: expectedFull, emphasize: solution.lemma, tip: `Nearly — it's **${solution.lemma}**.` };
      case 'EMPTY':
      default:
        return { correctAnswer: expectedFull, tip: `You left it blank — it's **${expectedFull}**.` };
    }
  }

  // BUILD_SENTENCE — only CORRECT | WRONG_FORM | EMPTY are reachable
  const solution = item.solution as BuildSentenceSolution;
  if (result === 'EMPTY') {
    return { correctAnswer: solution.sentenceText, tip: `You left it blank — here's the sentence: *${solution.sentenceText}*` };
  }
  if (solution.separablePrefix && solution.prefixSurface) {
    return {
      correctAnswer: solution.sentenceText,
      emphasize: solution.prefixSurface,
      tip: `**${solution.lemma}** splits: *${solution.sentenceText}*`,
    };
  }
  return { correctAnswer: solution.sentenceText, tip: `Word order matters — here's the sentence: *${solution.sentenceText}*` };
}

export type { DrillTaskType };
