import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@wortgarten/database';
import { HomeDashboardSchema } from '@wortgarten/shared';
import { AiService, FakeAdapter, type AiRouterPort } from '@wortgarten/ai';
import type { PrismaService } from '../prisma/prisma.service';
import { SessionBuilderService } from '../modules/session/session-builder.service';
import { SrsService } from '../modules/srs/srs.service';
import { WordsService } from '../modules/words/words.service';
import { HomeService } from './home.service';
import { StreakService } from '../streak/streak.service';
import { StoriesService } from '../stories/stories.service';

const LANG = 'de-home-fixture';

// No test user here has a recent drill session, so isEligibleForNewStory always short-circuits
// to false — this fake router/adapters exist only to satisfy StoriesService's constructor, never
// actually get called.
const fakeRouter: AiRouterPort = { decide: async () => 'OLLAMA', recordGroqSuccess: async () => {} };

const prisma = new PrismaClient();
const srs = new SrsService(prisma as unknown as PrismaService);
const words = new WordsService(prisma as unknown as PrismaService, srs);
const sessionBuilder = new SessionBuilderService(prisma as unknown as PrismaService, srs, words);
const streaks = new StreakService(prisma as unknown as PrismaService);
const aiService = new AiService(fakeRouter, new FakeAdapter('GROQ', ['{}']), new FakeAdapter('OLLAMA', ['{}']), 0);
const stories = new StoriesService(prisma as unknown as PrismaService, aiService, words);
const homeService = new HomeService(prisma as unknown as PrismaService, words, sessionBuilder, streaks, stories);

describe('HomeService.getDashboard — empty state', () => {
  let emptyUserId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { name: 'Fresh User', email: `home-empty-${Date.now()}@example.com` },
    });
    emptyUserId = user.id;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: emptyUserId } });
    await prisma.$disconnect();
  });

  it('renders with real zeros and still validates against the contract', async () => {
    const dashboard = await homeService.getDashboard(emptyUserId);

    expect(() => HomeDashboardSchema.parse(dashboard)).not.toThrow();
    expect(dashboard.session.wordCount).toBe(0);
    expect(dashboard.session.previewWords).toEqual([]);
    expect(dashboard.rusty.count).toBe(0);
    expect(dashboard.rusty.wordsPreview).toEqual([]);
    expect(dashboard.garden.collected).toBe(0);
    expect(dashboard.garden.segments).toEqual({ new: 0, learning: 0, mastered: 0 });
    expect(dashboard.recentlyAdded).toEqual([]);
    expect(dashboard.user.name).toBe('Fresh User');
    expect(dashboard.daySubtitle).toBe('Day 1 of learning German');
    expect(dashboard.streak.current).toBe(0);
    // A brand-new user has 0 known words — real "locked" state, never a fake 0%/0 min story.
    expect(dashboard.story).toEqual({ state: 'locked', wordsToGo: 15 });
  });
});

describe('HomeService.getDashboard — with data', () => {
  const prisma2 = prisma;
  const lexemeIds: string[] = [];
  let userId: string;

  beforeAll(async () => {
    const user = await prisma2.user.create({
      data: { name: 'Dinda Test', email: `home-data-${Date.now()}@example.com` },
    });
    userId = user.id;

    async function addWord(lemma: string, translation: string, level: 'NEW' | 'RECOGNIZE' | 'RECALL' | 'PRODUCE' | 'MASTERED', dueOffsetMs: number) {
      const lexeme = await prisma2.lexeme.create({
        data: {
          id: randomUUID(),
          sourceKey: randomUUID(),
          language: LANG,
          lemma,
          partOfSpeech: 'NOUN',
          senses: { create: [{ id: randomUUID(), sourceKey: randomUUID(), translation }] },
        },
        include: { senses: true },
      });
      lexemeIds.push(lexeme.id);
      return prisma2.userWord.create({
        data: {
          userId,
          senseId: lexeme.senses[0].id,
          level,
          dueAt: new Date(Date.now() + dueOffsetMs),
          // composePlan's "due reviewed" bucket requires reps > 0, and FSRS requires a real
          // lastReviewedAt whenever reps > 0 (the pair SrsService.grade always sets together).
          reps: level === 'NEW' ? 0 : 1,
          lastReviewedAt: level === 'NEW' ? null : new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      });
    }

    await addWord('Fenster', 'window', 'NEW', -1000); // due now
    await addWord('Katze', 'cat', 'RECALL', -1000); // due now
    await addWord('Baum', 'tree', 'MASTERED', 10 * 24 * 60 * 60 * 1000); // not due
  });

  afterAll(async () => {
    await prisma2.userWord.deleteMany({ where: { userId } });
    await prisma2.user.delete({ where: { id: userId } });
    await prisma2.lexeme.deleteMany({ where: { id: { in: lexemeIds } } });
  });

  it('aggregates real word-bank data into the dashboard', async () => {
    const dashboard = await homeService.getDashboard(userId);

    expect(() => HomeDashboardSchema.parse(dashboard)).not.toThrow();
    expect(dashboard.session.wordCount).toBe(2); // Fenster + Katze are due
    expect(dashboard.session.taskBreakdown.flashcards).toBe(1); // NEW → flashcards
    expect(dashboard.session.taskBreakdown.recalls).toBe(1); // RECALL → recalls
    expect(dashboard.garden.collected).toBe(3);
    expect(dashboard.garden.segments).toEqual({ new: 1, learning: 1, mastered: 1 });
    expect(dashboard.recentlyAdded).toHaveLength(3);
    expect(dashboard.recentlyAdded.map((w) => w.german).sort()).toEqual(['Baum', 'Fenster', 'Katze']);
    // Katze (RECALL) + Baum (MASTERED) are known; Fenster (NEW) isn't — 2 known, 13 short of the
    // same MIN_KNOWN_WORDS_FOR_STORY floor story generation uses.
    expect(dashboard.story).toEqual({ state: 'locked', wordsToGo: 13 });
  });
});
