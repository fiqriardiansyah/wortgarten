import { Injectable } from '@nestjs/common';
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { isValidTimeZone, localDateKey, localDayRange } from '@wortgarten/shared';
import type { Streak, StreakWeek, StreakWeekDayState } from '@wortgarten/shared';
import { PrismaService } from '../prisma/prisma.service';

const MAX_FREEZES = 2;

export type CalendarDayState = 'completed' | 'frozen';

interface ReplayedStreak {
  current: number;
  longest: number;
  freezesBanked: number;
  totalLearningDays: number;
  learnedToday: boolean;
  lastLearningDayKey: string | null;
  freezeSpentProtectingToday: boolean;
  dayStates: Record<string, CalendarDayState>;
}

// Re-exported so existing call sites (this file's own tests, home.service.ts,
// progress.service.ts, session-builder.service.ts) don't need to change their import path — the
// day-boundary logic now lives in @wortgarten/shared so packages/ai's story eligibility can share
// it too, without packages/ai depending on apps/api.
export { isValidTimeZone, localDateKey, localDayRange };

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
  const dayStates: Record<string, CalendarDayState> = {};

  for (const day of distinctDays) {
    if (lastLearningDayKey) {
      const gap = localDaysBetween(lastLearningDayKey, day);
      if (gap === 2 && freezesBanked > 0) {
        freezesBanked -= 1;
        dayStates[format(addDays(parseISO(lastLearningDayKey), 1), 'yyyy-MM-dd')] = 'frozen';
        if (day === todayKey) freezeSpentProtectingToday = true;
      } else if (gap >= 2) {
        current = 0;
      }
    }

    current += 1;
    totalLearningDays += 1;
    longest = Math.max(longest, current);
    lastLearningDayKey = day;
    dayStates[day] = 'completed';

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
      dayStates[format(addDays(parseISO(lastLearningDayKey), 1), 'yyyy-MM-dd')] = 'frozen';
    } else if (trailingGap >= 2) {
      current = 0;
    }
  }

  return {
    current,
    longest,
    freezesBanked,
    totalLearningDays,
    learnedToday,
    lastLearningDayKey,
    freezeSpentProtectingToday,
    dayStates,
  };
}

/** Renders the last `windowDays` calendar days (ending today, inclusive) from the day-state map
 * `replayLearningDays` already computed — no extra DB query needed. Days with no learning and no
 * spent freeze render 'muted'. */
export function buildStreakCalendar(
  dayStates: Record<string, CalendarDayState>,
  todayKey: string,
  windowDays: number,
): { date: string; state: CalendarDayState | 'muted' }[] {
  const days: { date: string; state: CalendarDayState | 'muted' }[] = [];
  for (let i = windowDays - 1; i >= 0; i--) {
    const date = format(addDays(parseISO(todayKey), -i), 'yyyy-MM-dd');
    days.push({ date, state: dayStates[date] ?? 'muted' });
  }
  return days;
}

const WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const;

/** Projects the canonical replay into the user's current Monday-first calendar week. */
export function buildStreakWeek(streak: StreakWithCalendar): StreakWeek {
  const today = parseISO(streak.todayKey);
  const monday = addDays(today, -((today.getDay() + 6) % 7));
  let freezeSpentThisWeek: StreakWeek['freezeSpentThisWeek'] = null;

  const days = WEEKDAY_LABELS.map((label, index) => {
    const date = addDays(monday, index);
    const dateKey = format(date, 'yyyy-MM-dd');
    const isToday = dateKey === streak.todayKey;
    const replayedState = streak.dayStates[dateKey];
    const isLearned = replayedState === 'completed';
    let state: StreakWeekDayState;

    if (isToday) state = 'today';
    else if (replayedState === 'completed') state = 'learned';
    else if (replayedState === 'frozen') state = 'frozen';
    else if (dateKey > streak.todayKey) state = 'future';
    else state = 'missed';

    if (replayedState === 'frozen') {
      freezeSpentThisWeek = { dayLabel: format(date, 'EEEE') };
    }

    return { label, state, isToday, isLearned };
  });

  return {
    todayLabel: format(today, 'EEE, d MMMM'),
    currentStreak: streak.current,
    freezesLeft: streak.freezesBanked,
    days,
    freezeSpentThisWeek,
  };
}

/** Adds fields Progress's Consistency card needs (aggregate streak + a rendered calendar) on top
 * of the plain Streak contract Home speaks — same computation, wider return shape. */
export interface StreakWithCalendar extends Streak {
  totalLearningDays: number;
  todayKey: string;
  dayStates: Record<string, CalendarDayState>;
}

@Injectable()
export class StreakService {
  constructor(private readonly prisma: PrismaService) {}

  async computeStreak(userId: string, timezone: string, now = new Date()): Promise<StreakWithCalendar> {
    return this.recomputeFromHistory(userId, timezone, now);
  }

  async recomputeFromHistory(userId: string, timezone?: string, now = new Date()): Promise<StreakWithCalendar> {
    const resolvedTimezone = timezone ?? (await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } })).timezone;
    const safeTimezone = isValidTimeZone(resolvedTimezone) ? resolvedTimezone : 'UTC';
    const [sessions, chatTurns, previous] = await Promise.all([
      this.prisma.drillSession.findMany({
        where: { userId, status: 'COMPLETED', completedAt: { not: null } },
        select: { completedAt: true },
        orderBy: { completedAt: 'asc' },
      }),
      // Talking to a character counts as a learn-day too (Story Chat) — a user's own sent
      // messages, same as a drill session's completedAt, are independent evidence of a learning
      // day. Pure replay stays the source of truth either way: no separate "record streak" call.
      this.prisma.message.findMany({
        where: { sender: 'user', conversation: { userId } },
        select: { createdAt: true },
      }),
      this.prisma.userStreak.findUnique({ where: { userId } }),
    ]);

    const todayKey = localDateKey(now, safeTimezone);
    const learningDayKeys = [
      ...sessions.flatMap(({ completedAt }) => (completedAt ? [localDateKey(completedAt, safeTimezone)] : [])),
      ...chatTurns.map(({ createdAt }) => localDateKey(createdAt, safeTimezone)),
    ];
    const replayed = replayLearningDays(learningDayKeys, todayKey);
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
      totalLearningDays: replayed.totalLearningDays,
      todayKey,
      dayStates: replayed.dayStates,
    };
  }
}
