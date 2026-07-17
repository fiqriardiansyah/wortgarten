import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@wortgarten/database';
import type { PrismaService } from '../../prisma/prisma.service';
import { SrsService } from '../srs/srs.service';
import { WordsService } from '../words/words.service';
import { SessionBuilderService, SESSION_MAX_NEW, SESSION_MAX_TASKS } from './session-builder.service';

// Regression fixture for the "8 undrilled words produced an 8-task session" bug: the NEW-word
// cap must apply unconditionally, even when there are no due words to fill the rest of the
// session with — a session that would otherwise be all-NEW must come out short, not padded.
const LANG = 'de-session-builder-fixture';

const prisma = new PrismaClient();
const prismaService = prisma as unknown as PrismaService;
const srs = new SrsService(prismaService);
const words = new WordsService(prismaService, srs);
const builder = new SessionBuilderService(prismaService, srs, words);

const lexemeIds: string[] = [];
const userIds: string[] = [];

async function makeUser() {
  const user = await prisma.user.create({ data: { name: 'Cap Fixture', email: `session-builder-${randomUUID()}@example.com` } });
  userIds.push(user.id);
  return user.id;
}

async function addWord(userId: string, lemma: string, opts: { due: boolean; reps: number }) {
  const lexeme = await prisma.lexeme.create({
    data: {
      id: randomUUID(),
      sourceKey: randomUUID(),
      language: LANG,
      lemma,
      partOfSpeech: 'NOUN',
      senses: { create: [{ id: randomUUID(), sourceKey: randomUUID(), translation: lemma }] },
    },
    include: { senses: true },
  });
  lexemeIds.push(lexeme.id);

  return prisma.userWord.create({
    data: {
      userId,
      senseId: lexeme.senses[0].id,
      level: opts.reps > 0 ? 'RECALL' : 'NEW',
      reps: opts.reps,
      // FSRS requires a real lastReviewedAt whenever reps > 0 (the pair SrsService.grade always
      // sets together) — otherwise get_retrievability computes an Invalid Date internally.
      lastReviewedAt: opts.reps > 0 ? new Date(Date.now() - 24 * 60 * 60 * 1000) : null,
      dueAt: new Date(Date.now() + (opts.due ? -1000 : 10 * 24 * 60 * 60 * 1000)),
    },
  });
}

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: userIds } } }); // cascades UserWord
  await prisma.lexeme.deleteMany({ where: { id: { in: lexemeIds } } });
  await prisma.$disconnect();
});

describe('SessionBuilderService — NEW-word cap', () => {
  it('8 undrilled words, nothing due -> exactly SESSION_MAX_NEW (4) tasks, not padded to the bank size', async () => {
    const userId = await makeUser();
    for (let i = 0; i < 8; i++) await addWord(userId, `Wort${i}`, { due: false, reps: 0 });

    const plan = await builder.composePlan(userId);
    const preview = await builder.planPreview(userId);

    expect(plan).toHaveLength(SESSION_MAX_NEW);
    expect(preview.dueCount).toBe(0);
    expect(preview.newCount).toBe(SESSION_MAX_NEW);
    expect(preview.total).toBe(SESSION_MAX_NEW);
    expect(preview.words).toHaveLength(SESSION_MAX_NEW);
  });

  it('2 undrilled words, nothing due -> a 2-task session (below the cap, so all of them)', async () => {
    const userId = await makeUser();
    for (let i = 0; i < 2; i++) await addWord(userId, `Klein${i}`, { due: false, reps: 0 });

    const plan = await builder.composePlan(userId);
    expect(plan).toHaveLength(2);
  });

  it('12 due + 5 undrilled -> session is the SESSION_MAX_TASKS (10) ceiling, all due, zero NEW', async () => {
    const userId = await makeUser();
    for (let i = 0; i < 12; i++) await addWord(userId, `Faellig${i}`, { due: true, reps: 1 });
    for (let i = 0; i < 5; i++) await addWord(userId, `Neu${i}`, { due: false, reps: 0 });

    const preview = await builder.planPreview(userId);
    expect(preview.dueCount).toBe(SESSION_MAX_TASKS);
    expect(preview.newCount).toBe(0);
    expect(preview.total).toBe(SESSION_MAX_TASKS);
  });

  it('3 due + 10 undrilled -> 7: 3 due + 4 NEW (cap), not 10', async () => {
    const userId = await makeUser();
    for (let i = 0; i < 3; i++) await addWord(userId, `Drei${i}`, { due: true, reps: 1 });
    for (let i = 0; i < 10; i++) await addWord(userId, `Zehn${i}`, { due: false, reps: 0 });

    const preview = await builder.planPreview(userId);
    expect(preview.dueCount).toBe(3);
    expect(preview.newCount).toBe(SESSION_MAX_NEW);
    expect(preview.total).toBe(7);
  });
});

const DAY_MS = 24 * 60 * 60 * 1000;

// Fixed stability, varying elapsed time since last review — lets each fixture land at a precise,
// predictable point on FSRS's decay curve instead of guessing at raw retrievability values.
async function addWordAtAge(userId: string, lemma: string, opts: { stability: number; daysAgo: number; reps?: number }) {
  const lexeme = await prisma.lexeme.create({
    data: {
      id: randomUUID(),
      sourceKey: randomUUID(),
      language: LANG,
      lemma,
      partOfSpeech: 'NOUN',
      senses: { create: [{ id: randomUUID(), sourceKey: randomUUID(), translation: lemma }] },
    },
    include: { senses: true },
  });
  lexemeIds.push(lexeme.id);

  return prisma.userWord.create({
    data: {
      userId,
      senseId: lexeme.senses[0].id,
      level: 'RECOGNIZE',
      stability: opts.stability,
      difficulty: 5,
      reps: opts.reps ?? 1,
      lastReviewedAt: new Date(Date.now() - opts.daysAgo * DAY_MS),
      dueAt: new Date(Date.now() - opts.daysAgo * DAY_MS),
    },
  });
}

describe('SessionBuilderService — composeRescuePlan (rusty-only)', () => {
  it('selects only rusty words, worst retrievability first — skips a fresh due word and NEW words entirely', async () => {
    const userId = await makeUser();
    // Same stability, longer elapsed = lower retrievability = more rusty.
    const worst = await addWordAtAge(userId, 'Schlimmst', { stability: 2, daysAgo: 90 });
    const mid = await addWordAtAge(userId, 'Mittel', { stability: 2, daysAgo: 45 });
    // High stability, just reviewed: due by the clock (dueAt === lastReviewedAt here) but nowhere near rusty.
    const strong = await addWordAtAge(userId, 'Stark', { stability: 100, daysAgo: 0 });
    await addWord(userId, 'Frisch', { due: false, reps: 0 }); // NEW — must never appear in a rescue

    const plan = await builder.composeRescuePlan(userId);

    expect(plan.map((item) => item.userWordId)).toEqual([worst.id, mid.id]);
    expect(plan.every((item) => item.userWordId !== strong.id)).toBe(true);
  });

  it('caps at SESSION_MAX_TASKS, taking the worst N and leaving the rest for next time', async () => {
    const userId = await makeUser();
    // Same stability throughout; larger daysAgo = lower retrievability = more rusty. 12 candidates,
    // only the 10 most-rusty (largest daysAgo) should make the cut.
    const words = [];
    for (let i = 0; i < 12; i++) {
      words.push(await addWordAtAge(userId, `Rost${i}`, { stability: 2, daysAgo: 30 + i * 5 }));
    }
    const leastRustyIds = words.slice(0, 2).map((w) => w.id); // daysAgo 30, 35
    const mostRustyIdsWorstFirst = words
      .slice(2)
      .map((w) => w.id)
      .reverse(); // daysAgo 85 down to 40

    const plan = await builder.composeRescuePlan(userId);

    expect(plan).toHaveLength(SESSION_MAX_TASKS);
    expect(plan.map((item) => item.userWordId)).toEqual(mostRustyIdsWorstFirst);
    for (const id of leastRustyIds) {
      expect(plan.some((item) => item.userWordId === id)).toBe(false);
    }
  });

  it('0 rusty words -> empty plan, never padded with non-rusty or NEW words', async () => {
    const userId = await makeUser();
    await addWordAtAge(userId, 'Taufrisch', { stability: 100, daysAgo: 0 });
    await addWord(userId, 'Neu', { due: false, reps: 0 });

    const plan = await builder.composeRescuePlan(userId);
    expect(plan).toEqual([]);
  });
});
