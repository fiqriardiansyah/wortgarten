import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient, type UserWord } from '@wortgarten/database';
import type { PrismaService } from '../../prisma/prisma.service';
import { SrsService } from './srs.service';

const LANG = 'de-srs-fixture';

// Pure-logic methods (mapToRating, applyLevel, retrievability) never touch
// `this.prisma`, so a stub is enough for those describe blocks.
const pureSrs = new SrsService({} as unknown as PrismaService);

describe('SrsService.mapToRating', () => {
  it('WRONG_MEANING and EMPTY map to AGAIN — the only results that do', () => {
    expect(pureSrs.mapToRating('WRONG_MEANING', 500, 'PICK_MEANING')).toBe('AGAIN');
    expect(pureSrs.mapToRating('EMPTY', 500, 'TYPE_WORD')).toBe('AGAIN');
  });

  it('grammar/keyboard errors map to HARD, not AGAIN — the word is known, the shape was wrong', () => {
    expect(pureSrs.mapToRating('WRONG_GENDER', 1000, 'TYPE_WORD')).toBe('HARD');
    expect(pureSrs.mapToRating('WRONG_FORM', 1000, 'TYPE_WORD')).toBe('HARD');
    expect(pureSrs.mapToRating('MISSING_ARTICLE', 1000, 'TYPE_WORD')).toBe('HARD');
    expect(pureSrs.mapToRating('MISSING_UMLAUT', 1000, 'TYPE_WORD')).toBe('HARD');
  });

  it('CORRECT_WITH_TYPO always maps to HARD, regardless of speed', () => {
    expect(pureSrs.mapToRating('CORRECT_WITH_TYPO', 500, 'TYPE_WORD')).toBe('HARD');
    expect(pureSrs.mapToRating('CORRECT_WITH_TYPO', 9000, 'TYPE_WORD')).toBe('HARD');
  });

  it('a fast CORRECT on PICK_MEANING maps to EASY — the one Easy codepath, and it is PICK_MEANING-only', () => {
    expect(pureSrs.mapToRating('CORRECT', 999, 'PICK_MEANING')).toBe('EASY');
  });

  it('a fast CORRECT on TYPE_WORD or BUILD_SENTENCE stays GOOD — typing time is not recall time', () => {
    expect(pureSrs.mapToRating('CORRECT', 999, 'TYPE_WORD')).toBe('GOOD');
    expect(pureSrs.mapToRating('CORRECT', 999, 'BUILD_SENTENCE')).toBe('GOOD');
  });

  it('a normal-speed or slow CORRECT on PICK_MEANING is GOOD, not EASY', () => {
    expect(pureSrs.mapToRating('CORRECT', 5000, 'PICK_MEANING')).toBe('GOOD');
  });
});

describe('SrsService.applyLevel', () => {
  it('moves up the ladder one rung per pass', () => {
    expect(pureSrs.applyLevel('NEW', true)).toBe('RECOGNIZE');
    expect(pureSrs.applyLevel('RECOGNIZE', true)).toBe('RECALL');
    expect(pureSrs.applyLevel('RECALL', true)).toBe('PRODUCE');
    expect(pureSrs.applyLevel('PRODUCE', true)).toBe('MASTERED');
  });

  it('caps at MASTERED', () => {
    expect(pureSrs.applyLevel('MASTERED', true)).toBe('MASTERED');
  });

  it('moves down the ladder one rung per fail', () => {
    expect(pureSrs.applyLevel('PRODUCE', false)).toBe('RECALL');
    expect(pureSrs.applyLevel('RECALL', false)).toBe('RECOGNIZE');
  });

  it('floors at NEW', () => {
    expect(pureSrs.applyLevel('NEW', false)).toBe('NEW');
  });
});

describe('SrsService.retrievability', () => {
  it('is near 1 right after a review with positive stability', () => {
    const now = new Date();
    const r = pureSrs.retrievability(
      { stability: 10, difficulty: 5, dueAt: now, reps: 1, lapses: 0, lastReviewedAt: now },
      now,
    );
    expect(r).toBeGreaterThan(0.9);
    expect(r).toBeLessThanOrEqual(1);
  });

  it('decays as time since the last review grows', () => {
    const lastReviewedAt = new Date('2026-01-01T00:00:00Z');
    const state = { stability: 10, difficulty: 5, dueAt: lastReviewedAt, reps: 1, lapses: 0, lastReviewedAt };
    const rSoon = pureSrs.retrievability(state, new Date('2026-01-02T00:00:00Z'));
    const rLater = pureSrs.retrievability(state, new Date('2026-02-01T00:00:00Z'));
    expect(rLater).toBeLessThan(rSoon);
  });

  it('a never-reviewed word (reps 0) is fully retrievable, not decayed — it hasn\'t been learned yet, so it isn\'t "forgotten" either', () => {
    const now = new Date();
    const r = pureSrs.retrievability({ stability: 0, difficulty: 0, dueAt: now, reps: 0, lapses: 0, lastReviewedAt: null }, now);
    expect(r).toBe(1);
  });
});

describe('SrsService.grade (integration)', () => {
  const prisma = new PrismaClient();
  const srs = new SrsService(prisma as unknown as PrismaService);

  const lexemeIds: string[] = [];
  let testUserId: string;
  let userWord: UserWord;
  let drillSessionId: string;

  beforeAll(async () => {
    const lexeme = await prisma.lexeme.create({
      data: {
        id: randomUUID(),
        sourceKey: randomUUID(),
        language: LANG,
        lemma: 'lernen',
        partOfSpeech: 'VERB',
        senses: { create: [{ id: randomUUID(), sourceKey: randomUUID(), translation: 'to learn' }] },
      },
      include: { senses: true },
    });
    lexemeIds.push(lexeme.id);

    const user = await prisma.user.create({
      data: { name: 'Srs Test', email: `srs-test-${Date.now()}@example.com` },
    });
    testUserId = user.id;

    userWord = await prisma.userWord.create({
      data: { userId: testUserId, senseId: lexeme.senses[0].id },
    });

    const drillSession = await prisma.drillSession.create({
      data: { userId: testUserId, plan: [] },
    });
    drillSessionId = drillSession.id;
  });

  afterAll(async () => {
    await prisma.attempt.deleteMany({ where: { userWordId: userWord.id } });
    await prisma.drillSession.delete({ where: { id: drillSessionId } });
    await prisma.userWord.deleteMany({ where: { userId: testUserId } });
    await prisma.user.delete({ where: { id: testUserId } });
    await prisma.lexeme.deleteMany({ where: { id: { in: lexemeIds } } });
    await prisma.$disconnect();
  });

  it('advances FSRS state, the ladder, and records the response time + rating used', async () => {
    const before = new Date();
    const updated = await srs.grade(userWord, 'CORRECT', 1200, 'PICK_MEANING', {
      drillSessionId,
      planItemId: 'plan-item-1',
      isRetry: false,
      nextLevel: 'RECOGNIZE',
    });

    expect(updated.reps).toBe(1);
    expect(updated.stability).toBeGreaterThan(0);
    expect(updated.dueAt.getTime()).toBeGreaterThan(before.getTime());
    expect(updated.lastReviewedAt).not.toBeNull();
    expect(updated.level).toBe('RECOGNIZE');
    expect(updated.statsByMode).toEqual({ PICK_MEANING: { total: 1, correct: 1 } });

    const attempts = await prisma.attempt.findMany({ where: { userWordId: userWord.id } });
    expect(attempts).toHaveLength(1);
    expect(attempts[0].responseTimeMs).toBe(1200);
    expect(attempts[0].rating).toBe('EASY'); // fast CORRECT on PICK_MEANING
    expect(attempts[0].result).toBe('CORRECT');
    expect(attempts[0].taskType).toBe('PICK_MEANING');
    expect(attempts[0].drillSessionId).toBe(drillSessionId);
    expect(attempts[0].planItemId).toBe('plan-item-1');
    expect(attempts[0].isRetry).toBe(false);

    userWord = updated;
  });

  it('records a lapse and drops the ladder when a reviewed card is later graded WRONG_MEANING', async () => {
    const beforeLapses = userWord.lapses;
    const failed = await srs.grade(userWord, 'WRONG_MEANING', 4000, 'PICK_MEANING', {
      drillSessionId,
      planItemId: 'plan-item-2',
      isRetry: false,
      nextLevel: 'NEW',
    });

    expect(failed.lapses).toBeGreaterThan(beforeLapses);
    expect(failed.level).toBe('NEW');
    expect(failed.statsByMode).toEqual({ PICK_MEANING: { total: 2, correct: 1 } });

    const attempts = await prisma.attempt.findMany({
      where: { userWordId: userWord.id },
      orderBy: { answeredAt: 'asc' },
    });
    expect(attempts).toHaveLength(2);
    expect(attempts[1].rating).toBe('AGAIN');
    expect(attempts[1].result).toBe('WRONG_MEANING');
  });

  it('the same (drillSessionId, planItemId) cannot be graded twice — the DB unique constraint enforces idempotency', async () => {
    await expect(
      srs.grade(userWord, 'CORRECT', 1000, 'PICK_MEANING', {
        drillSessionId,
        planItemId: 'plan-item-1', // reused from the first test
        isRetry: false,
        nextLevel: 'RECOGNIZE',
      }),
    ).rejects.toThrow();
  });
});
