import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { DrillSession, Prisma, WordLevel } from '@wortgarten/database';
import {
  GRADING_MATRIX,
  PlanSchema,
  buildCorrection,
  gradeBuildSentence,
  gradePickMeaning,
  gradeTypeWord,
  isIncomplete,
  sanitizePlanItem,
  type AttemptResult,
  type CorrectionContext,
  type LadderAction,
  type LexemeResolution,
  type PlanItem,
  type SessionTask,
  type SubmitAttemptRequest,
  type SubmitAttemptResponse,
} from '@wortgarten/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { LookupService } from '../lexicon/lookup.service';
import { SrsService } from '../srs/srs.service';
import { incrementStatsByMode } from '../words/stats-by-mode';

const MAX_RETRIES_PER_WORD_PER_SESSION = 4;
// Inserting at +4 leaves three intervening cards before the retry.
const RETRY_LOOKAHEAD = 4;
const PASSING_RESULTS: ReadonlySet<AttemptResult> = new Set(['CORRECT', 'CORRECT_WITH_TYPO']);

@Injectable()
export class SessionGradingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly srs: SrsService,
    private readonly lookup: LookupService,
  ) {}

  async submitAttempt(session: DrillSession, request: SubmitAttemptRequest): Promise<SubmitAttemptResponse> {
    const plan = PlanSchema.parse(session.plan);
    const itemIndex = plan.findIndex((i) => i.id === request.planItemId);
    if (itemIndex === -1) throw new NotFoundException('Unknown plan item');
    const item = plan[itemIndex];

    const existing = await this.prisma.attempt.findUnique({
      where: { drillSessionId_planItemId: { drillSessionId: session.id, planItemId: item.id } },
    });
    if (existing) {
      const practicedCount = await this.countPracticed(session.id);
      return {
        result: existing.result,
        climbed: false,
        requeued: false,
        correction: existing.result === 'CORRECT' ? undefined : buildCorrection(item, existing.result),
        currentIndex: session.currentIndex,
        practicedCount,
      };
    }

    const { result, detail } = await this.gradeResponse(item, request.response);
    const matrixEntry = GRADING_MATRIX[result];

    const userWord = await this.prisma.userWord.findUniqueOrThrow({
      where: { id: item.userWordId },
      include: { sense: { include: { lexeme: true } } },
    });

    const touched = !item.isRetry && !session.isPractice;
    let climbed = false;

    if (touched) {
      const nextLevel = await this.decideNextLevel(userWord.level, isIncomplete(userWord.sense.lexeme), item, matrixEntry.ladderAction, session.id);
      climbed = matrixEntry.ladderAction === 'climb' && nextLevel !== userWord.level;
      await this.srs.grade(userWord, result, request.responseTimeMs, item.taskType, {
        drillSessionId: session.id,
        planItemId: item.id,
        isRetry: false,
        nextLevel,
      });
    } else {
      const rating = this.srs.mapToRating(result, request.responseTimeMs, item.taskType);
      await this.prisma.$transaction(async (tx) => {
        await tx.attempt.create({
          data: {
            userWordId: userWord.id,
            taskType: item.taskType,
            result,
            responseTimeMs: request.responseTimeMs,
            rating,
            drillSessionId: session.id,
            planItemId: item.id,
            isRetry: item.isRetry,
          },
        });
        if (!item.isRetry) await incrementStatsByMode(tx, userWord.id, item.taskType, result);
      });
    }

    let requeued = false;
    let insertedRetryTask: SessionTask | undefined;
    // Derive the counter from the persisted frozen plan, never from client/Zustand state. Scope
    // it to this word so misses on other words cannot consume its retry allowance.
    const retriesSoFar = plan.filter((p) => p.isRetry && p.userWordId === item.userWordId).length;

    if (matrixEntry.requeue && !item.isRetry && retriesSoFar < MAX_RETRIES_PER_WORD_PER_SESSION) {
      const retryItem: PlanItem = { ...item, id: `${item.id}-retry`, isRetry: true };
      const insertAt = Math.min(itemIndex + RETRY_LOOKAHEAD, plan.length);
      plan.splice(insertAt, 0, retryItem);
      requeued = true;
      insertedRetryTask = sanitizePlanItem(retryItem);
    }

    const currentIndex = session.currentIndex + 1;
    await this.prisma.drillSession.update({
      where: { id: session.id },
      data: { plan: plan as unknown as Prisma.InputJsonValue, currentIndex },
    });

    const practicedCount = await this.countPracticed(session.id);

    return {
      result,
      climbed,
      requeued,
      correction: result === 'CORRECT' ? undefined : buildCorrection(item, result, detail),
      insertedRetryTask,
      currentIndex,
      practicedCount,
    };
  }

  private async countPracticed(drillSessionId: string): Promise<number> {
    return this.prisma.attempt.count({ where: { drillSessionId, isRetry: false } });
  }

  /**
   * hold → unchanged. drop → one rung down (only WRONG_MEANING drops — the ladder rule that must
   * never be collapsed). climb is where the two overrides live: a PRODUCE word only reaches
   * MASTERED via a gated, cross-session BUILD_SENTENCE pass (never the TYPE_WORD fallback, never a
   * single lucky pass); an incomplete noun cannot climb past RECOGNIZE.
   */
  private async decideNextLevel(
    currentLevel: WordLevel,
    lexemeIsIncomplete: boolean,
    item: PlanItem,
    ladderAction: LadderAction,
    currentSessionId: string,
  ): Promise<WordLevel> {
    if (ladderAction === 'hold') return currentLevel;
    if (ladderAction === 'drop') return this.srs.applyLevel(currentLevel, false);

    // climb
    if (currentLevel === 'PRODUCE') {
      if (item.taskType !== 'BUILD_SENTENCE') return 'PRODUCE'; // fallback TYPE_WORD never masters
      const gatePassed = await this.checkMasteredGate(item.userWordId, currentSessionId);
      return gatePassed ? 'MASTERED' : 'PRODUCE';
    }
    if (currentLevel === 'RECOGNIZE' && lexemeIsIncomplete) return 'RECOGNIZE';
    return this.srs.applyLevel(currentLevel, true);
  }

  /** No counter column — derived from Attempt. Passes iff the single most recent non-retry
   * BUILD_SENTENCE attempt for this word climbed AND belongs to a different session (so the
   * current climbing pass and that one form two *consecutive*, cross-session passes). */
  private async checkMasteredGate(userWordId: string, currentSessionId: string): Promise<boolean> {
    const prior = await this.prisma.attempt.findFirst({
      where: { userWordId, taskType: 'BUILD_SENTENCE', isRetry: false },
      orderBy: { answeredAt: 'desc' },
    });
    return !!prior && PASSING_RESULTS.has(prior.result) && prior.drillSessionId !== currentSessionId;
  }

  private async gradeResponse(item: PlanItem, response: SubmitAttemptRequest['response']): Promise<{ result: AttemptResult; detail?: CorrectionContext }> {
    if (item.taskType === 'PICK_MEANING') {
      if (response.taskType !== 'PICK_MEANING') throw new BadRequestException('taskType mismatch');
      const result = gradePickMeaning({ chosenSenseId: response.chosenSenseId, correctSenseId: item.solution.correctSenseId });
      if (response.chosenSenseId === item.solution.correctSenseId && result !== 'CORRECT') {
        throw new Error('PICK_MEANING invariant violated: correct sense was not graded CORRECT');
      }
      return { result };
    }

    if (item.taskType === 'BUILD_SENTENCE') {
      if (response.taskType !== 'BUILD_SENTENCE') throw new BadRequestException('taskType mismatch');
      return { result: gradeBuildSentence({ submittedTileIds: response.tileIds, correctTileOrder: item.solution.correctTileOrder }) };
    }

    if (response.taskType !== 'TYPE_WORD') throw new BadRequestException('taskType mismatch');
    const resolveLexeme = async (text: string): Promise<LexemeResolution[]> => {
      const matches = await this.lookup.lookupForm(text, 'de');
      return matches.map((m) => ({
        lexemeId: m.lexeme.id,
        senseId: m.senses[0]?.id ?? '',
        lemma: m.lexeme.lemma,
        translation: m.senses[0]?.translation ?? '',
      }));
    };
    const outcome = await gradeTypeWord(response.text, item.solution, resolveLexeme);
    return { result: outcome.result, detail: outcome.umlautContrast ? { umlautContrast: outcome.umlautContrast } : undefined };
  }
}
