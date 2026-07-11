import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@wortgarten/database';
import { HomeDashboardSchema } from '@wortgarten/shared';
import type { PrismaService } from '../prisma/prisma.service';
import { SrsService } from '../modules/srs/srs.service';
import { WordsService } from '../modules/words/words.service';
import { HomeService } from './home.service';

const LANG = 'de-home-fixture';

const prisma = new PrismaClient();
const srs = new SrsService(prisma as unknown as PrismaService);
const words = new WordsService(prisma as unknown as PrismaService, srs);
const homeService = new HomeService(prisma as unknown as PrismaService, words);

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
        data: { language: LANG, lemma, partOfSpeech: 'NOUN', senses: { create: [{ translation }] } },
        include: { senses: true },
      });
      lexemeIds.push(lexeme.id);
      return prisma2.userWord.create({
        data: {
          userId,
          senseId: lexeme.senses[0].id,
          level,
          dueAt: new Date(Date.now() + dueOffsetMs),
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
  });
});
