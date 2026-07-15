import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@wortgarten/database';
import type { PrismaService } from '../../prisma/prisma.service';
import { SrsService } from '../srs/srs.service';
import { SessionBuilderService, SESSION_MAX_NEW, SESSION_MAX_TASKS } from './session-builder.service';

// Regression fixture for the "8 undrilled words produced an 8-task session" bug: the NEW-word
// cap must apply unconditionally, even when there are no due words to fill the rest of the
// session with — a session that would otherwise be all-NEW must come out short, not padded.
const LANG = 'de-session-builder-fixture';

const prisma = new PrismaClient();
const prismaService = prisma as unknown as PrismaService;
const srs = new SrsService(prismaService);
const builder = new SessionBuilderService(prismaService, srs);

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
