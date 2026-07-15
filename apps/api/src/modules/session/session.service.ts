import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { DrillSession, Prisma } from '@wortgarten/database';
import {
  PlanSchema,
  displayForm,
  sanitizePlanItem,
  type CreateSessionResponse,
  type DrillSessionResponse,
  type PracticeSessionRequest,
  type SecondCardSlot,
  type SessionCompleteResponse,
  type SubmitAttemptRequest,
  type SubmitAttemptResponse,
} from '@wortgarten/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionBuilderService } from './session-builder.service';
import { SessionGradingService } from './session-grading.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_SENTENCE_TOKENS = 4;
const MAX_SENTENCE_TOKENS = 10;

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly builder: SessionBuilderService,
    private readonly grading: SessionGradingService,
  ) {}

  /** Resume-or-create. An ACTIVE session started <24h ago is returned as-is; older ones are marked
   * ABANDONED and a fresh one is built. Nothing due is reported, never treated as an error. */
  async createOrResume(userId: string): Promise<CreateSessionResponse> {
    const existing = await this.prisma.drillSession.findFirst({
      where: { userId, status: 'ACTIVE' },
      orderBy: { startedAt: 'desc' },
    });

    if (existing) {
      const ageMs = Date.now() - existing.startedAt.getTime();
      if (ageMs < DAY_MS) {
        return { kind: 'session', session: await this.toDrillSessionResponse(existing) };
      }
      await this.prisma.drillSession.update({ where: { id: existing.id }, data: { status: 'ABANDONED' } });
    }

    const plan = await this.builder.composePlan(userId);
    if (plan.length === 0) return { kind: 'nothing_due' };

    const created = await this.prisma.drillSession.create({
      data: { userId, plan: plan as unknown as Prisma.InputJsonValue, status: 'ACTIVE', currentIndex: 0, isPractice: false },
    });
    return { kind: 'session', session: await this.toDrillSessionResponse(created) };
  }

  async getActive(userId: string): Promise<DrillSessionResponse | null> {
    const session = await this.prisma.drillSession.findFirst({ where: { userId, status: 'ACTIVE' }, orderBy: { startedAt: 'desc' } });
    return session ? this.toDrillSessionResponse(session) : null;
  }

  async submitAttempt(userId: string, sessionId: string, request: SubmitAttemptRequest): Promise<SubmitAttemptResponse> {
    const session = await this.getOwnedActiveSession(userId, sessionId);
    return this.grading.submitAttempt(session, request);
  }

  async abandon(userId: string, sessionId: string): Promise<void> {
    const session = await this.prisma.drillSession.findUnique({ where: { id: sessionId } });
    if (!session || session.userId !== userId) throw new NotFoundException('Session not found');
    if (session.status === 'ACTIVE') {
      await this.prisma.drillSession.update({ where: { id: sessionId }, data: { status: 'ABANDONED' } });
    }
  }

  async complete(userId: string, sessionId: string): Promise<SessionCompleteResponse> {
    const session = await this.getOwnedActiveSession(userId, sessionId);
    const plan = PlanSchema.parse(session.plan);
    const originalItems = plan.filter((item) => !item.isRetry);

    const [practiced, correct] = await Promise.all([
      this.prisma.attempt.count({ where: { drillSessionId: sessionId, isRetry: false } }),
      this.prisma.attempt.count({
        where: { drillSessionId: sessionId, isRetry: false, result: { in: ['CORRECT', 'CORRECT_WITH_TYPO'] } },
      }),
    ]);

    const userWords = await this.prisma.userWord.findMany({
      where: { id: { in: originalItems.map((item) => item.userWordId) } },
      include: { sense: { include: { lexeme: true } } },
    });
    const byId = new Map(userWords.map((w) => [w.id, w]));

    let leveledUp = 0;
    const masteredWords: { userWordId: string; displayForm: string }[] = [];
    for (const item of originalItems) {
      const userWord = byId.get(item.userWordId);
      if (!userWord || userWord.level === item.levelAtPlanTime) continue;
      leveledUp++;
      if (userWord.level === 'MASTERED') {
        masteredWords.push({ userWordId: userWord.id, displayForm: displayForm(userWord.sense.lexeme) });
      }
    }

    const secondCard = await this.buildSecondCardSlot(userId);

    await this.prisma.drillSession.update({ where: { id: sessionId }, data: { status: 'COMPLETED', completedAt: new Date() } });

    return {
      practiced,
      correct,
      leveledUp,
      elapsedMs: Date.now() - session.startedAt.getTime(),
      masteredWords,
      secondCard,
    };
  }

  async practice(userId: string, request: PracticeSessionRequest): Promise<CreateSessionResponse> {
    const plan = await this.builder.composePracticePlan(userId, request.size, request.userWordId);
    if (plan.length === 0) return { kind: 'nothing_due' };

    const created = await this.prisma.drillSession.create({
      data: { userId, plan: plan as unknown as Prisma.InputJsonValue, status: 'ACTIVE', currentIndex: 0, isPractice: true },
    });
    return { kind: 'session', session: await this.toDrillSessionResponse(created) };
  }

  private async getOwnedActiveSession(userId: string, sessionId: string): Promise<DrillSession> {
    const session = await this.prisma.drillSession.findUnique({ where: { id: sessionId } });
    if (!session || session.userId !== userId) throw new NotFoundException('Session not found');
    if (session.status !== 'ACTIVE') throw new BadRequestException('Session is not active');
    return session;
  }

  private async toDrillSessionResponse(session: DrillSession): Promise<DrillSessionResponse> {
    const plan = PlanSchema.parse(session.plan);
    const practicedCount = await this.prisma.attempt.count({ where: { drillSessionId: session.id, isRetry: false } });

    return {
      id: session.id,
      status: session.status,
      isPractice: session.isPractice,
      currentIndex: session.currentIndex,
      totalCount: plan.filter((item) => !item.isRetry).length,
      practicedCount,
      startedAt: session.startedAt.toISOString(),
      tasks: plan.map(sanitizePlanItem),
    };
  }

  /** One of four, first that applies — never a fake quest card (there's no quest table). */
  private async buildSecondCardSlot(userId: string): Promise<SecondCardSlot> {
    const incompleteCount = await this.prisma.userWord.count({
      where: { userId, sense: { lexeme: { partOfSpeech: 'NOUN', OR: [{ gender: null }, { plural: null }] } } },
    });
    if (incompleteCount > 0) return { type: 'incomplete_nouns', count: incompleteCount };

    const produceWords = await this.prisma.userWord.findMany({
      where: { userId, level: 'PRODUCE' },
      select: { sense: { select: { lexemeId: true } } },
    });
    let stuckCount = 0;
    for (const word of produceWords) {
      const tileableCount = await this.prisma.exampleWord.count({
        where: {
          lexemeId: word.sense.lexemeId,
          isUsableForTiles: true,
          example: { isWellFormed: true, tokenCount: { gte: MIN_SENTENCE_TOKENS, lte: MAX_SENTENCE_TOKENS } },
        },
      });
      if (tileableCount === 0) stuckCount++;
    }
    if (stuckCount > 0) return { type: 'stuck_produce', count: stuckCount };

    const nextDue = await this.prisma.userWord.findFirst({
      where: { userId, dueAt: { gt: new Date() } },
      orderBy: { dueAt: 'asc' },
    });
    if (nextDue) return { type: 'next_review', dueLabel: formatDueLabel(nextDue.dueAt) };

    return { type: 'none' };
  }
}

function formatDueLabel(dueAt: Date): string {
  const days = Math.ceil((dueAt.getTime() - Date.now()) / DAY_MS);
  if (days <= 1) return 'tomorrow';
  if (days <= 6) return `in ${days} days`;
  return dueAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
