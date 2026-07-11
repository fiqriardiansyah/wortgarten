import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@wortgarten/database';
import type { PrismaService } from '../../prisma/prisma.service';
import { SrsService } from '../srs/srs.service';
import { WordsService } from './words.service';

const LANG = 'de-words-fixture';
const DAY_MS = 24 * 60 * 60 * 1000;

const prisma = new PrismaClient();
const srs = new SrsService(prisma as unknown as PrismaService);
const words = new WordsService(prisma as unknown as PrismaService, srs);

const lexemeIds: string[] = [];
let userAId: string;
let userBId: string;

async function createSense(lemma: string, translation: string) {
  const lexeme = await prisma.lexeme.create({
    data: {
      language: LANG,
      lemma,
      partOfSpeech: 'VERB',
      senses: { create: [{ translation }] },
    },
    include: { senses: true },
  });
  lexemeIds.push(lexeme.id);
  return lexeme.senses[0];
}

beforeAll(async () => {
  const userA = await prisma.user.create({ data: { name: 'Words Test A', email: `words-test-a-${Date.now()}@example.com` } });
  const userB = await prisma.user.create({ data: { name: 'Words Test B', email: `words-test-b-${Date.now()}@example.com` } });
  userAId = userA.id;
  userBId = userB.id;

  const now = Date.now();

  // Reviewed a while ago, low stability, long overdue → should read as rusty
  // (retrievability ≈0.59 at 60 days elapsed with stability 2, per FSRS's curve).
  const rustySense = await createSense('üben', 'to practice');
  await prisma.userWord.create({
    data: {
      userId: userAId,
      senseId: rustySense.id,
      level: 'RECOGNIZE',
      stability: 2,
      difficulty: 5,
      reps: 1,
      lapses: 0,
      dueAt: new Date(now - 60 * DAY_MS),
      lastReviewedAt: new Date(now - 60 * DAY_MS),
      addedAt: new Date(now - 70 * DAY_MS),
    },
  });

  // Overdue by the clock, but just reviewed with high stability → due, not rusty.
  const strongSense = await createSense('warten', 'to wait');
  await prisma.userWord.create({
    data: {
      userId: userAId,
      senseId: strongSense.id,
      level: 'PRODUCE',
      stability: 100,
      difficulty: 3,
      reps: 5,
      lapses: 0,
      dueAt: new Date(now - 60 * 60 * 1000),
      lastReviewedAt: new Date(now - 60 * 60 * 1000),
      addedAt: new Date(now - 20 * DAY_MS),
    },
  });

  // Not due yet at all.
  const freshSense = await createSense('helfen', 'to help');
  await prisma.userWord.create({
    data: {
      userId: userAId,
      senseId: freshSense.id,
      level: 'NEW',
      stability: 20,
      difficulty: 4,
      reps: 1,
      lapses: 0,
      dueAt: new Date(now + 7 * DAY_MS),
      lastReviewedAt: new Date(now),
      addedAt: new Date(now - 1 * DAY_MS),
    },
  });

  // Belongs to a different user entirely — must never leak into userA's queries.
  const otherUserSense = await createSense('lernen', 'to learn');
  await prisma.userWord.create({
    data: {
      userId: userBId,
      senseId: otherUserSense.id,
      level: 'NEW',
      dueAt: new Date(now - DAY_MS),
    },
  });
});

afterAll(async () => {
  await prisma.userWord.deleteMany({ where: { userId: { in: [userAId, userBId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
  await prisma.lexeme.deleteMany({ where: { id: { in: lexemeIds } } });
  await prisma.$disconnect();
});

describe('WordsService', () => {
  it('countForUser counts only that user’s words', async () => {
    expect(await words.countForUser(userAId)).toBe(3);
    expect(await words.countForUser(userBId)).toBe(1);
  });

  it('countByLevel buckets by level, zero-filled for unused levels', async () => {
    const counts = await words.countByLevel(userAId);
    expect(counts).toEqual({ NEW: 1, RECOGNIZE: 1, RECALL: 0, PRODUCE: 1, MASTERED: 0 });
  });

  it('findRusty filters candidates by dueAt then by computed retrievability', async () => {
    const rusty = await words.findRusty(userAId, 0.7);
    const lemmas = rusty.map((r) => r.userWord.sense.lexeme.lemma);

    expect(lemmas).toContain('üben'); // long overdue, low stability
    expect(lemmas).not.toContain('warten'); // due by clock, but freshly strong
    expect(lemmas).not.toContain('helfen'); // not due at all
  });

  it('findDue returns only due words, most-overdue first', async () => {
    const due = await words.findDue(userAId, 10);
    const lemmas = due.map((d) => d.sense.lexeme.lemma);

    // üben has been due since 30 days ago, warten only since 1 hour ago;
    // dueAt ascending puts the more-overdue word first. helfen isn't due yet.
    expect(lemmas).toEqual(['üben', 'warten']);
  });

  it('recentlyAdded orders by addedAt descending and respects the limit', async () => {
    const recent = await words.recentlyAdded(userAId, 2);
    expect(recent.map((r) => r.sense.lexeme.lemma)).toEqual(['helfen', 'warten']);
  });

  it('never returns another user’s UserWord rows', async () => {
    const due = await words.findDue(userAId, 50);
    const recent = await words.recentlyAdded(userAId, 50);
    const rusty = await words.findRusty(userAId, 1); // threshold 1 = everyone due counts as rusty

    expect(due.every((d) => d.userId === userAId)).toBe(true);
    expect(recent.every((r) => r.userId === userAId)).toBe(true);
    expect(rusty.every((r) => r.userWord.userId === userAId)).toBe(true);

    // and the reverse: userB's word never shows up under userA's id
    expect(due.some((d) => d.userId === userBId)).toBe(false);
  });
});
