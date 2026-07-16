import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service';
import { buildStreakWeek, localDateKey, localDayRange, replayLearningDays, StreakService } from './streak.service';

function days(start: number, end: number): string[] {
  return Array.from({ length: end - start + 1 }, (_, index) => `2026-07-${String(start + index).padStart(2, '0')}`);
}

describe('replayLearningDays', () => {
  it('counts at most one completed session per local day', () => {
    const result = replayLearningDays(['2026-07-15', '2026-07-15', '2026-07-16'], '2026-07-16');
    expect(result).toMatchObject({ current: 2, longest: 2, learnedToday: true });
  });

  it('earns one freeze per seven learning days and caps the bank at two', () => {
    expect(replayLearningDays(days(1, 7), '2026-07-07').freezesBanked).toBe(1);
    expect(replayLearningDays(days(1, 14), '2026-07-14').freezesBanked).toBe(2);
    expect(replayLearningDays(days(1, 21), '2026-07-21').freezesBanked).toBe(2);
  });

  it('holds the streak and spends one freeze for exactly one missed day', () => {
    const result = replayLearningDays([...days(1, 7), '2026-07-09'], '2026-07-09');
    expect(result).toMatchObject({ current: 8, freezesBanked: 0, freezeSpentProtectingToday: true });
  });

  it('resets without a freeze and across two missed days even with freezes', () => {
    expect(replayLearningDays(['2026-07-01', '2026-07-03'], '2026-07-03').current).toBe(1);
    const afterVacation = replayLearningDays([...days(1, 14), '2026-07-17'], '2026-07-17');
    expect(afterVacation).toMatchObject({ current: 1, freezesBanked: 2 });
  });

  it('does not break yesterday\'s streak merely by viewing Home today', () => {
    expect(replayLearningDays(['2026-07-15'], '2026-07-16').current).toBe(1);
  });
});

describe('timezone helpers', () => {
  it('assigns the same instant to different local days when appropriate', () => {
    const instant = new Date('2026-07-16T17:30:00.000Z');
    expect(localDateKey(instant, 'Asia/Jakarta')).toBe('2026-07-17');
    expect(localDateKey(instant, 'America/New_York')).toBe('2026-07-16');
  });

  it('uses real local midnights across DST rather than fixed 24-hour days', () => {
    const range = localDayRange('2026-03-08', 'America/New_York');
    expect(range.end.getTime() - range.start.getTime()).toBe(23 * 60 * 60 * 1000);
  });
});

describe('buildStreakWeek', () => {
  it('renders the current week Monday-first and keeps learned-today information', () => {
    const replayed = replayLearningDays(['2026-07-13', '2026-07-15'], '2026-07-15');
    const week = buildStreakWeek({
      ...replayed,
      freezeSavedYesterday: false,
      todayKey: '2026-07-15',
    });

    expect(week.todayLabel).toBe('Wed, 15 July');
    expect(week.days).toEqual([
      { label: 'Mo', state: 'learned', isToday: false, isLearned: true },
      { label: 'Tu', state: 'missed', isToday: false, isLearned: false },
      { label: 'We', state: 'today', isToday: true, isLearned: true },
      { label: 'Th', state: 'future', isToday: false, isLearned: false },
      { label: 'Fr', state: 'future', isToday: false, isLearned: false },
      { label: 'Sa', state: 'future', isToday: false, isLearned: false },
      { label: 'Su', state: 'future', isToday: false, isLearned: false },
    ]);
  });

  it('names a freeze spent this week and safely renders empty history', () => {
    const frozenReplay = replayLearningDays([...days(6, 12), '2026-07-14'], '2026-07-14');
    const frozenWeek = buildStreakWeek({
      ...frozenReplay,
      freezeSavedYesterday: false,
      todayKey: '2026-07-14',
    });
    expect(frozenWeek.freezeSpentThisWeek).toEqual({ dayLabel: 'Monday' });
    expect(frozenWeek.days[0]).toMatchObject({ state: 'frozen', isLearned: false });

    const emptyReplay = replayLearningDays([], '2026-07-15');
    const emptyWeek = buildStreakWeek({
      ...emptyReplay,
      freezeSavedYesterday: false,
      todayKey: '2026-07-15',
    });
    expect(emptyWeek).toMatchObject({ currentStreak: 0, freezesLeft: 0, freezeSpentThisWeek: null });
    expect(emptyWeek.days).toHaveLength(7);
  });
});

describe('StreakService snapshot behavior', () => {
  it('does not spend or announce the same freeze twice and can rebuild a dropped snapshot', async () => {
    let snapshot: Record<string, unknown> | null = null;
    const completedAt = days(1, 7).map((day) => ({ completedAt: new Date(`${day}T12:00:00.000Z`) }));
    const prisma = {
      drillSession: { findMany: vi.fn().mockResolvedValue(completedAt) },
      userStreak: {
        findUnique: vi.fn(async () => snapshot),
        upsert: vi.fn(async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
          snapshot = snapshot ? { ...snapshot, ...update } : { ...create };
          return snapshot;
        }),
      },
    } as unknown as PrismaService;
    const service = new StreakService(prisma);
    const now = new Date('2026-07-09T12:00:00.000Z');

    const first = await service.computeStreak('user-1', 'UTC', now);
    const repeated = await service.computeStreak('user-1', 'UTC', now);
    expect(first).toMatchObject({ current: 7, longest: 7, freezesBanked: 0, freezeSavedYesterday: true });
    expect(repeated).toMatchObject({ current: 7, longest: 7, freezesBanked: 0, freezeSavedYesterday: false });

    snapshot = null;
    const rebuilt = await service.recomputeFromHistory('user-1', 'UTC', now);
    expect(rebuilt).toMatchObject({ current: 7, longest: 7, freezesBanked: 0 });
  });
});
