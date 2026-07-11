import { Injectable } from '@nestjs/common';
import { HomeDashboard, HomeDashboardSchema, type WordLevel as ContractWordLevel } from '@wortgarten/shared';
import type { WordLevel } from '@wortgarten/database';
import { PrismaService } from '../prisma/prisma.service';
import { WordsService } from '../modules/words/words.service';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const RUSTY_THRESHOLD = 0.7;
const SESSION_CAP = 10;
const MINUTES_PER_TASK = 0.5;

// Collapses the 5-rung learning ladder to the 3-bucket shape the Home
// contract (and its UI) already speak — the contract stays unchanged.
function toContractLevel(level: WordLevel): ContractWordLevel {
  if (level === 'NEW') return 'new';
  if (level === 'MASTERED') return 'mastered';
  return 'learning';
}

function taskTypeForLevel(level: WordLevel): 'flashcards' | 'recalls' | 'sentenceBuilds' {
  switch (level) {
    case 'NEW':
    case 'RECOGNIZE':
      return 'flashcards';
    case 'RECALL':
      return 'recalls';
    case 'PRODUCE':
    case 'MASTERED':
      return 'sentenceBuilds';
  }
}

@Injectable()
export class HomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly words: WordsService,
  ) {}

  async getDashboard(userId: string): Promise<HomeDashboard> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const [sessionWords, rusty, collected, byLevel, recentlyAdded] = await Promise.all([
      this.words.findDue(userId, SESSION_CAP),
      this.words.findRusty(userId, RUSTY_THRESHOLD),
      this.words.countForUser(userId),
      this.words.countByLevel(userId),
      this.words.recentlyAdded(userId, 3),
    ]);

    const rustyUserWordIds = new Set(rusty.map((r) => r.userWord.id));

    const taskBreakdown = { flashcards: 0, recalls: 0, sentenceBuilds: 0 };
    for (const word of sessionWords) {
      taskBreakdown[taskTypeForLevel(word.level)] += 1;
    }

    const daysSinceJoined = Math.floor((Date.now() - user.createdAt.getTime()) / MS_PER_DAY) + 1;
    const firstName = user.name.split(' ')[0] || user.name;

    const dashboard: HomeDashboard = {
      greeting: `Hallo, ${firstName}! 👋`,
      daySubtitle: `Day ${daysSinceJoined} of learning German`,
      streakDays: 0, // TODO: no streak-tracking table yet — needs a real model in a later task
      session: {
        wordCount: sessionWords.length,
        estMinutes: Math.ceil(sessionWords.length * MINUTES_PER_TASK),
        taskBreakdown,
        previewWords: sessionWords.slice(0, 3).map((w) => w.sense.lexeme.lemma),
      },
      rusty: {
        count: rusty.length,
        wordsPreview: rusty.slice(0, 3).map((r) => r.userWord.sense.lexeme.lemma),
        extraCount: Math.max(0, rusty.length - 3),
      },
      quest: {
        // TODO: no quest table yet — placeholder until a later task adds one
        label: 'Master 10 words this week',
        current: 0,
        target: 10,
        rewardLabel: 'Keep going to earn your gold star ⭐',
      },
      garden: {
        collected,
        mastered: byLevel.MASTERED,
        segments: {
          new: byLevel.NEW,
          learning: byLevel.RECOGNIZE + byLevel.RECALL + byLevel.PRODUCE,
          mastered: byLevel.MASTERED,
        },
      },
      story: {
        // TODO: no story generation yet — placeholder until the worker/AI task lands
        id: 'placeholder',
        title: 'Your first story is on its way',
        coverage: '0%',
        minutes: 0,
      },
      recentlyAdded: recentlyAdded.map((w) => ({
        german: w.sense.lexeme.lemma,
        native: w.customTranslation ?? w.sense.translation,
        level: toContractLevel(w.level),
        isRusty: rustyUserWordIds.has(w.id),
      })),
      user: {
        name: user.name,
        tagline: user.tagline ?? 'Learning German 🇩🇪',
      },
    };

    return HomeDashboardSchema.parse(dashboard);
  }
}
