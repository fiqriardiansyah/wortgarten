import { Injectable } from '@nestjs/common';
import { fsrs as createFsrs, Rating, State, type CardInput, type Grade } from 'ts-fsrs';
import type { AttemptResult, FsrsRating, TaskType, UserWord, WordLevel } from '@wortgarten/database';
import { PrismaService } from '../../prisma/prisma.service';

const FAST_RESPONSE_MS = 3000;
const SLOW_RESPONSE_MS = 8000;

const PASSING_RESULTS: ReadonlySet<AttemptResult> = new Set(['CORRECT', 'CORRECT_WITH_TYPO']);

const RATING_TO_GRADE: Record<FsrsRating, Grade> = {
  AGAIN: Rating.Again,
  HARD: Rating.Hard,
  GOOD: Rating.Good,
  EASY: Rating.Easy,
};

// NEW → RECOGNIZE → RECALL → PRODUCE → MASTERED. Separate from FSRS: this
// decides HOW a word is tested, FSRS decides WHEN it comes back.
const LEVEL_LADDER: WordLevel[] = ['NEW', 'RECOGNIZE', 'RECALL', 'PRODUCE', 'MASTERED'];

/** The subset of UserWord's FSRS columns needed to reconstruct an FSRS card. */
export type FsrsUserWordState = Pick<UserWord, 'stability' | 'difficulty' | 'dueAt' | 'reps' | 'lapses' | 'lastReviewedAt'>;

@Injectable()
export class SrsService {
  // enable_short_term: false — our schema has no `state`/`learning_steps`
  // column, so we skip step-based (re)learning and let stability alone drive
  // scheduling; this is a supported ts-fsrs mode, not a hand-rolled curve.
  private readonly scheduler = createFsrs({ enable_short_term: false });

  constructor(private readonly prisma: PrismaService) {}

  /** fail → AGAIN; pass+fast → EASY; pass+slow → HARD; pass at normal speed → GOOD. */
  mapToRating(result: AttemptResult, responseTimeMs: number): FsrsRating {
    if (!PASSING_RESULTS.has(result)) return 'AGAIN';
    if (responseTimeMs < FAST_RESPONSE_MS) return 'EASY';
    if (responseTimeMs < SLOW_RESPONSE_MS) return 'GOOD';
    return 'HARD';
  }

  private toCard(state: FsrsUserWordState): CardInput {
    return {
      due: state.dueAt,
      stability: state.stability,
      difficulty: state.difficulty,
      elapsed_days: 0,
      scheduled_days: 0,
      learning_steps: 0,
      reps: state.reps,
      lapses: state.lapses,
      state: state.reps === 0 ? State.New : State.Review,
      last_review: state.lastReviewedAt ?? undefined,
    };
  }

  /** Current recall probability (0-1) from FSRS state. Computed on demand — there is no stored "strength". */
  retrievability(state: FsrsUserWordState, now: Date = new Date()): number {
    // A never-reviewed word (stability 0) isn't "forgotten" — it just hasn't been
    // learned yet. Running FSRS's decay formula on stability 0 collapses to ~0,
    // which would wrongly flag every freshly-added word as rusty on day one.
    if (state.reps === 0) return 1;
    return this.scheduler.get_retrievability(this.toCard(state), now, false);
  }

  /** Grades one attempt: advances FSRS state on UserWord and records the Attempt it learns from. */
  async grade(userWord: UserWord, result: AttemptResult, responseTimeMs: number, taskType: TaskType): Promise<UserWord> {
    const rating = this.mapToRating(result, responseTimeMs);
    const now = new Date();
    const { card } = this.scheduler.next(this.toCard(userWord), now, RATING_TO_GRADE[rating]);

    const [updated] = await this.prisma.$transaction([
      this.prisma.userWord.update({
        where: { id: userWord.id },
        data: {
          stability: card.stability,
          difficulty: card.difficulty,
          dueAt: card.due,
          reps: card.reps,
          lapses: card.lapses,
          lastReviewedAt: now,
        },
      }),
      this.prisma.attempt.create({
        data: {
          userWordId: userWord.id,
          taskType,
          result,
          responseTimeMs,
          rating,
        },
      }),
    ]);

    return updated;
  }

  /** The ladder is plain code, independent of FSRS: pass moves up one rung, fail moves down one. */
  applyLevel(currentLevel: WordLevel, passed: boolean): WordLevel {
    const index = LEVEL_LADDER.indexOf(currentLevel);
    const nextIndex = passed ? Math.min(index + 1, LEVEL_LADDER.length - 1) : Math.max(index - 1, 0);
    return LEVEL_LADDER[nextIndex];
  }
}
