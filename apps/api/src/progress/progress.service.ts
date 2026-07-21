import { Injectable } from '@nestjs/common';
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { displayForm, ProgressDashboardSchema, type ProblemWord, type ProgressDashboard } from '@wortgarten/shared';
import { PrismaService } from '../prisma/prisma.service';
import { WordsService } from '../modules/words/words.service';
import {
  buildStreakCalendar,
  buildStreakWeek,
  isValidTimeZone,
  localDateKey,
  localDayRange,
  StreakService,
} from '../streak/streak.service';

const CALENDAR_WINDOW_DAYS = 21; // 3 weeks — enough for a meaningful grid without scrolling
const GROWTH_WINDOW_DAYS = 14;
// "Misses" for the Problem children card — near-misses (typo/umlaut/article) don't count, only
// answers that got the word itself wrong.
const MISS_RESULTS = ['WRONG_GENDER', 'WRONG_MEANING', 'WRONG_FORM', 'EMPTY'] as const;
const PROBLEM_WORDS_LIMIT = 5;

@Injectable()
export class ProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly words: WordsService,
    private readonly streaks: StreakService,
  ) {}

  async getDashboard(userId: string, reportedTimezone?: string): Promise<ProgressDashboard> {
    let user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (
      reportedTimezone &&
      !user.timezoneSetManually &&
      reportedTimezone !== user.timezone &&
      isValidTimeZone(reportedTimezone)
    ) {
      user = await this.prisma.user.update({ where: { id: userId }, data: { timezone: reportedTimezone } });
    }
    const safeTimezone = isValidTimeZone(user.timezone) ? user.timezone : 'UTC';
    const now = new Date();

    const [collected, byLevel, streak, problemWords] = await Promise.all([
      this.words.countForUser(userId),
      this.words.countByLevel(userId),
      this.streaks.computeStreak(userId, safeTimezone, now),
      this.getProblemWords(userId),
    ]);

    const createdKey = localDateKey(user.createdAt, safeTimezone);
    const todayKey = localDateKey(now, safeTimezone);
    const daysSinceCreation = differenceInCalendarDays(parseISO(todayKey), parseISO(createdKey)) + 1;

    const growth = await this.getGrowth(userId, safeTimezone, todayKey, daysSinceCreation);
    const calendar = buildStreakCalendar(streak.dayStates, streak.todayKey, CALENDAR_WINDOW_DAYS);

    const dashboard: ProgressDashboard = {
      daySubtitle: `Day ${daysSinceCreation} of learning German`,
      garden: {
        collected,
        mastered: byLevel.MASTERED,
        segments: {
          new: byLevel.NEW,
          learning: byLevel.RECOGNIZE + byLevel.RECALL + byLevel.PRODUCE,
          mastered: byLevel.MASTERED,
        },
      },
      streak: {
        current: streak.current,
        longest: streak.longest,
        freezesBanked: streak.freezesBanked,
        learnedToday: streak.learnedToday,
        freezeSavedYesterday: streak.freezeSavedYesterday,
        totalLearningDays: streak.totalLearningDays,
        calendar,
      },
      streakWeek: buildStreakWeek(streak),
      problemWords,
      growth,
    };

    return ProgressDashboardSchema.parse(dashboard);
  }

  /** First-attempts only (isRetry: false) so a retried-and-fixed answer isn't counted twice —
   * same rule the spec calls out for UserWord.statsByMode. */
  private async getProblemWords(userId: string): Promise<ProblemWord[]> {
    const userWords = await this.prisma.userWord.findMany({ where: { userId }, select: { id: true } });
    const userWordIds = userWords.map((w) => w.id);
    if (userWordIds.length === 0) return [];

    const groups = await this.prisma.attempt.groupBy({
      by: ['userWordId'],
      where: { userWordId: { in: userWordIds }, isRetry: false, result: { in: [...MISS_RESULTS] } },
      _count: { _all: true },
    });
    if (groups.length === 0) return [];

    const top = [...groups].sort((a, b) => b._count._all - a._count._all).slice(0, PROBLEM_WORDS_LIMIT);
    const detailed = await this.prisma.userWord.findMany({
      where: { id: { in: top.map((g) => g.userWordId) } },
      include: { sense: { include: { lexeme: true } } },
    });
    const byId = new Map(detailed.map((w) => [w.id, w]));

    return top.flatMap((g) => {
      const userWord = byId.get(g.userWordId);
      if (!userWord) return [];
      return [
        {
          userWordId: userWord.id,
          displayForm: displayForm(userWord.sense.lexeme),
          translation: userWord.customTranslation ?? userWord.sense.translation,
          misses: g._count._all,
        },
      ];
    });
  }

  /** Bucketed by UserWord.addedAt in the user's own timezone. windowDays adapts to account age so
   * the label never overclaims (a 3-day-old account gets a 3-day window, not a fake "30 days"). */
  private async getGrowth(userId: string, timezone: string, todayKey: string, accountAgeDays: number) {
    const windowDays = Math.max(1, Math.min(GROWTH_WINDOW_DAYS, accountAgeDays));
    const windowStartKey = format(addDays(parseISO(todayKey), -(windowDays - 1)), 'yyyy-MM-dd');
    const windowStart = localDayRange(windowStartKey, timezone).start;

    const rows = await this.prisma.userWord.findMany({
      where: { userId, addedAt: { gte: windowStart } },
      select: { addedAt: true },
    });

    const countsByDay = new Map<string, number>();
    for (const row of rows) {
      const key = localDateKey(row.addedAt, timezone);
      countsByDay.set(key, (countsByDay.get(key) ?? 0) + 1);
    }

    const bars = [];
    for (let i = windowDays - 1; i >= 0; i--) {
      const date = format(addDays(parseISO(todayKey), -i), 'yyyy-MM-dd');
      bars.push({ label: format(parseISO(date), 'MMM d'), count: countsByDay.get(date) ?? 0 });
    }

    return {
      windowDays,
      totalInWindow: bars.reduce((sum, bar) => sum + bar.count, 0),
      bars,
    };
  }
}
