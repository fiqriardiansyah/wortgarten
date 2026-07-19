import { randomUUID } from 'crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@wortgarten/database';
import { isEligibleForNewStory, STORY_ELIGIBLE_ACTIVE_DAYS } from './eligibility';

const prisma = new PrismaClient();
const userIds: string[] = [];

async function createUser(timezone = 'UTC') {
  const user = await prisma.user.create({
    data: { name: 'Eligibility Test', email: `eligibility-test-${randomUUID()}@example.com`, timezone },
  });
  userIds.push(user.id);
  return user.id;
}

async function addDrillSession(userId: string, startedAt: Date) {
  await prisma.drillSession.create({ data: { userId, plan: [], startedAt } });
}

async function createStory(userId: string, createdAt: Date, readAt: Date | null) {
  await prisma.story.create({
    data: { userId, title: 'Test Story', paragraphs: [], newWords: [], glossary: {}, coverageKnownPct: 100, estMinutes: 1, createdAt, readAt },
  });
}

afterAll(async () => {
  await prisma.story.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.drillSession.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe('isEligibleForNewStory', () => {
  it('is false for a dormant user (no session within STORY_ELIGIBLE_ACTIVE_DAYS)', async () => {
    const userId = await createUser();
    const now = new Date();
    await addDrillSession(userId, new Date(now.getTime() - (STORY_ELIGIBLE_ACTIVE_DAYS + 1) * 24 * 60 * 60 * 1000));

    expect(await isEligibleForNewStory(prisma, userId, now)).toBe(false);
  });

  it('is true for a recently active user with no stories at all', async () => {
    const userId = await createUser();
    const now = new Date();
    await addDrillSession(userId, now);

    expect(await isEligibleForNewStory(prisma, userId, now)).toBe(true);
  });

  it('is false while an unread story is waiting, regardless of when it was created', async () => {
    const userId = await createUser();
    const now = new Date();
    await addDrillSession(userId, now);
    await createStory(userId, new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000), null);

    expect(await isEligibleForNewStory(prisma, userId, now)).toBe(false);
  });

  it("is false once today's story has already been read too — the actual cadence bug: reading it must not unlock another one", async () => {
    const userId = await createUser();
    const now = new Date();
    await addDrillSession(userId, now);
    await createStory(userId, now, now); // generated and read today

    expect(await isEligibleForNewStory(prisma, userId, now)).toBe(false);
  });

  it("is true once the user's local day has rolled over, even though the UTC calendar date has not", async () => {
    // America/New_York is UTC-4 in July: 01:00 UTC is still the PREVIOUS New York day.
    const userId = await createUser('America/New_York');
    const storyCreatedAt = new Date('2026-07-16T01:00:00.000Z'); // 2026-07-15 in New York
    await addDrillSession(userId, storyCreatedAt);
    await createStory(userId, storyCreatedAt, storyCreatedAt);

    const now = new Date('2026-07-16T23:00:00.000Z'); // same UTC date, but already 2026-07-16 in New York
    expect(await isEligibleForNewStory(prisma, userId, now)).toBe(true);
  });

  it("is false across a UTC date rollover that is still the same day in the user's timezone", async () => {
    // Asia/Jakarta is UTC+7: 23:00 UTC Jul 16 and 01:00 UTC Jul 17 are both Jul 17 in Jakarta.
    const userId = await createUser('Asia/Jakarta');
    const storyCreatedAt = new Date('2026-07-16T23:00:00.000Z'); // 2026-07-17 in Jakarta
    await addDrillSession(userId, storyCreatedAt);
    await createStory(userId, storyCreatedAt, storyCreatedAt);

    const now = new Date('2026-07-17T01:00:00.000Z'); // different UTC date, still 2026-07-17 in Jakarta
    expect(await isEligibleForNewStory(prisma, userId, now)).toBe(false);
  });
});
