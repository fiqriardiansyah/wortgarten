import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient, type UserWord } from '@wortgarten/database';
import type { PrismaService } from '../../prisma/prisma.service';
import { SrsService } from './srs.service';

const LANG = 'de-srs-fixture';

// Pure-logic methods (mapToRating, applyLevel, retrievability) never touch
// `this.prisma`, so a stub is enough for those describe blocks.
const pureSrs = new SrsService({} as unknown as PrismaService);

describe('SrsService.mapToRating', () => {
  it('fail results always map to AGAIN, regardless of speed', () => {
    expect(pureSrs.mapToRating('WRONG_MEANING', 500)).toBe('AGAIN');
    expect(pureSrs.mapToRating('EMPTY', 20000)).toBe('AGAIN');
    expect(pureSrs.mapToRating('WRONG_GENDER', 1000)).toBe('AGAIN');
    expect(pureSrs.mapToRating('WRONG_FORM', 1000)).toBe('AGAIN');
  });

  it('fast pass maps to EASY', () => {
    expect(pureSrs.mapToRating('CORRECT', 999)).toBe('EASY');
  });

  it('normal-speed pass maps to GOOD', () => {
    expect(pureSrs.mapToRating('CORRECT', 5000)).toBe('GOOD');
  });

  it('slow pass maps to HARD', () => {
    expect(pureSrs.mapToRating('CORRECT_WITH_TYPO', 9000)).toBe('HARD');
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

  beforeAll(async () => {
    const lexeme = await prisma.lexeme.create({
      data: {
        language: LANG,
        lemma: 'lernen',
        partOfSpeech: 'VERB',
        senses: { create: [{ translation: 'to learn' }] },
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
  });

  afterAll(async () => {
    await prisma.userWord.deleteMany({ where: { userId: testUserId } });
    await prisma.user.delete({ where: { id: testUserId } });
    await prisma.lexeme.deleteMany({ where: { id: { in: lexemeIds } } });
    await prisma.$disconnect();
  });

  it('advances FSRS state and records the response time + rating used', async () => {
    const before = new Date();
    const updated = await srs.grade(userWord, 'CORRECT', 1200, 'PICK_MEANING');

    expect(updated.reps).toBe(1);
    expect(updated.stability).toBeGreaterThan(0);
    expect(updated.dueAt.getTime()).toBeGreaterThan(before.getTime());
    expect(updated.lastReviewedAt).not.toBeNull();

    const attempts = await prisma.attempt.findMany({ where: { userWordId: userWord.id } });
    expect(attempts).toHaveLength(1);
    expect(attempts[0].responseTimeMs).toBe(1200);
    expect(attempts[0].rating).toBe('EASY'); // 1200ms is under the fast threshold
    expect(attempts[0].result).toBe('CORRECT');
    expect(attempts[0].taskType).toBe('PICK_MEANING');

    userWord = updated;
  });

  it('records a lapse when a reviewed card is later graded AGAIN', async () => {
    const beforeLapses = userWord.lapses;
    const failed = await srs.grade(userWord, 'WRONG_MEANING', 4000, 'PICK_MEANING');

    expect(failed.lapses).toBeGreaterThan(beforeLapses);

    const attempts = await prisma.attempt.findMany({
      where: { userWordId: userWord.id },
      orderBy: { answeredAt: 'asc' },
    });
    expect(attempts).toHaveLength(2);
    expect(attempts[1].rating).toBe('AGAIN');
    expect(attempts[1].result).toBe('WRONG_MEANING');
  });
});
