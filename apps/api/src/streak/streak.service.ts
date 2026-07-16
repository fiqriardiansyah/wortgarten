import { Injectable } from '@nestjs/common';
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import type { Streak } from '@wortgarten/shared';
import { PrismaService } from '../prisma/prisma.service';

const MAX_FREEZES = 2;

interface ReplayedStreak {
  current: number;
  longest: number;
  freezesBanked: number;
  learnedToday: boolean;
  lastLearningDayKey: string | null;
  freezeSpentProtectingToday: boolean;
}

export function isValidTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

export function localDateKey(date: Date, timezone: string): string {
  return formatInTimeZone(date, timezone, 'yyyy-MM-dd');
}

export function localDayRange(dayKey: string, timezone: string): { start: Date; end: Date } {
  const nextDayKey = format(addDays(parseISO(dayKey), 1), 'yyyy-MM-dd');
  return {
    start: fromZonedTime(`${dayKey}T00:00:00`, timezone),
    end: fromZonedTime(`${nextDayKey}T00:00:00`, timezone),
  };
}

function localDaysBetween(earlier: string, later: string): number {
  return differenceInCalendarDays(parseISO(later), parseISO(earlier));
}

/** Pure replay makes the database row disposable: completed session timestamps remain canonical. */
export function replayLearningDays(learningDayKeys: string[], todayKey: string): ReplayedStreak {
  const distinctDays = [...new Set(learningDayKeys)].filter((day) => day <= todayKey).sort();
  let current = 0;
  let longest = 0;
  let freezesBanked = 0;
  let totalLearningDays = 0;
  let lastLearningDayKey: string | null = null;
  let freezeSpentProtectingToday = false;

  for (const day of distinctDays) {
    if (lastLearningDayKey) {
      const gap = localDaysBetween(lastLearningDayKey, day);
      if (gap === 2 && freezesBanked > 0) {
        freezesBanked -= 1;
        if (day === todayKey) freezeSpentProtectingToday = true;
      } else if (gap >= 2) {
        current = 0;
      }
    }

    current += 1;
    totalLearningDays += 1;
    longest = Math.max(longest, current);
    lastLearningDayKey = day;

    if (totalLearningDays % 7 === 0) {
      freezesBanked = Math.min(MAX_FREEZES, freezesBanked + 1);
    }
  }

  const learnedToday = lastLearningDayKey === todayKey;
  if (lastLearningDayKey && !learnedToday) {
    const trailingGap = localDaysBetween(lastLearningDayKey, todayKey);
    if (trailingGap === 2 && freezesBanked > 0) {
      freezesBanked -= 1;
      freezeSpentProtectingToday = true;
    } else if (trailingGap >= 2) {
      current = 0;
    }
  }

  return {
    current,
    longest,
    freezesBanked,
    learnedToday,
    lastLearningDayKey,
    freezeSpentProtectingToday,
  };
}

@Injectable()
export class StreakService {
  constructor(private readonly prisma: PrismaService) {}

  async computeStreak(userId: string, timezone: string, now = new Date()): Promise<Streak> {
    return this.recomputeFromHistory(userId, timezone, now);
  }

  async recomputeFromHistory(userId: string, timezone?: string, now = new Date()): Promise<Streak> {
    const resolvedTimezone = timezone ?? (await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } })).timezone;
    const safeTimezone = isValidTimeZone(resolvedTimezone) ? resolvedTimezone : 'UTC';
    const [sessions, previous] = await Promise.all([
      this.prisma.drillSession.findMany({
        where: { userId, status: 'COMPLETED', completedAt: { not: null } },
        select: { completedAt: true },
        orderBy: { completedAt: 'asc' },
      }),
      this.prisma.userStreak.findUnique({ where: { userId } }),
    ]);

    const todayKey = localDateKey(now, safeTimezone);
    const replayed = replayLearningDays(
      sessions.flatMap(({ completedAt }) => (completedAt ? [localDateKey(completedAt, safeTimezone)] : [])),
      todayKey,
    );
    const lastLearningDay = replayed.lastLearningDayKey
      ? localDayRange(replayed.lastLearningDayKey, safeTimezone).start
      : null;

    const snapshotAlreadyMatches =
      previous?.current === replayed.current &&
      previous.longest === replayed.longest &&
      previous.freezesBanked === replayed.freezesBanked &&
      (previous.lastLearningDay?.getTime() ?? null) === (lastLearningDay?.getTime() ?? null);

    await this.prisma.userStreak.upsert({
      where: { userId },
      create: {
        userId,
        current: replayed.current,
        longest: replayed.longest,
        freezesBanked: replayed.freezesBanked,
        lastLearningDay,
        lastComputedAt: now,
      },
      update: {
        current: replayed.current,
        longest: replayed.longest,
        freezesBanked: replayed.freezesBanked,
        lastLearningDay,
        lastComputedAt: now,
      },
    });

    return {
      current: replayed.current,
      longest: replayed.longest,
      freezesBanked: replayed.freezesBanked,
      learnedToday: replayed.learnedToday,
      freezeSavedYesterday: replayed.freezeSpentProtectingToday && !snapshotAlreadyMatches,
    };
  }
}
