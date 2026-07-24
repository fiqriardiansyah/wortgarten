import type { PrismaClient } from '@wortgarten/database';
import { computeWorldProgress, isKnownLevel, isValidTimeZone, localDateKey, localDayRange } from '@wortgarten/shared';

export interface SelectedWorld {
  key: string;
  name: string;
  icon: string;
  hint: string;
}

/**
 * Pure bag logic — no IO, easy to unit test. Pure random world selection clumps (Café, Café, Park,
 * Café), which is the exact repetition problem worlds exist to fix, so instead: exclude the
 * recently-used worlds from the bag and pick randomly from what's left, resetting once every
 * unlocked world has had a turn. A world unlocked today always wins outright — the unlock
 * celebration on the session summary already promised "tonight's story happens there" (see
 * apps/web's SessionSummary.tsx), and a promise made must be kept.
 */
export function pickTonightsWorld(unlockedKeys: string[], recentKeys: string[], justUnlockedKey: string | null): string {
  if (justUnlockedKey && unlockedKeys.includes(justUnlockedKey)) return justUnlockedKey;

  const recentSet = new Set(recentKeys);
  let bag = unlockedKeys.filter((key) => !recentSet.has(key));
  if (bag.length === 0) bag = [...unlockedKeys]; // every unlocked world has had a turn — start the rotation over
  return bag[Math.floor(Math.random() * bag.length)];
}

/**
 * Picks tonight's world for this user, or null if none are unlocked yet (shouldn't happen once any
 * `World` rows exist, since the always-free 0-required world is unlocked for everyone — but a
 * user's dictionary language having no seeded worlds at all is a real possible state, e.g. tests).
 * All state this needs is derived fresh every call — no bag/rotation column, per the same
 * derived-not-cached discipline the rest of story generation and the streak system already follow.
 */
export async function selectWorldForStory(prisma: PrismaClient, userId: string, language = 'de'): Promise<SelectedWorld | null> {
  const worlds = await prisma.world.findMany({ include: { words: { select: { lexemeId: true } } } });
  if (worlds.length === 0) return null;

  const [knownRows, unlockRows, user] = await Promise.all([
    prisma.userWord.findMany({
      where: { userId, sense: { lexeme: { language } } },
      select: { level: true, sense: { select: { lexemeId: true } } },
    }),
    prisma.userWorldUnlock.findMany({ where: { userId }, include: { world: { select: { key: true } } } }),
    prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } }),
  ]);

  const knownLexemeIds = new Set(knownRows.filter((row) => isKnownLevel(row.level)).map((row) => row.sense.lexemeId));
  const haveCounts: Record<string, number> = {};
  for (const world of worlds) {
    haveCounts[world.key] = world.words.filter((w) => knownLexemeIds.has(w.lexemeId)).length;
  }
  const unlockedKeySet = new Set(unlockRows.map((r) => r.world.key));

  const progress = computeWorldProgress(worlds, haveCounts, unlockedKeySet);
  const unlockedKeys = progress.filter((p) => p.isUnlocked).map((p) => p.key);
  if (unlockedKeys.length === 0) return null;

  // Deduped, most-recent-first, capped at `unlockedKeys.length - 1` — guarantees every unlocked
  // world gets a turn before any repeats, even as new worlds unlock mid-rotation (see
  // pickTonightsWorld's own doc comment). Overfetches (2x) since the raw rows aren't deduped yet.
  const recentStoryRows = await prisma.story.findMany({
    where: { userId, worldKey: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: Math.max(unlockedKeys.length * 2, 4),
    select: { worldKey: true },
  });

  const timezone = user && isValidTimeZone(user.timezone) ? user.timezone : 'UTC';
  const todayRange = localDayRange(localDateKey(new Date(), timezone), timezone);
  const justUnlocked = unlockRows.find((r) => r.unlockedAt >= todayRange.start && r.unlockedAt < todayRange.end);
  // "Jumps the queue" delivers the promise exactly once — the FIRST story generated after the
  // unlock. Without this guard, every generation for the rest of that calendar day would keep
  // re-forcing the same world (a real bug caught live: two forced back-to-back generations both
  // picked the just-unlocked world instead of rotating) — the moment the most recent story already
  // used it, the promise is kept and normal bag rotation takes back over.
  const mostRecentWorldKey = recentStoryRows[0]?.worldKey ?? null;
  const justUnlockedKey = justUnlocked && justUnlocked.world.key !== mostRecentWorldKey ? justUnlocked.world.key : null;

  const recentKeys: string[] = [];
  const seenKeys = new Set<string>();
  for (const row of recentStoryRows) {
    if (!row.worldKey || seenKeys.has(row.worldKey)) continue;
    seenKeys.add(row.worldKey);
    recentKeys.push(row.worldKey);
    if (recentKeys.length >= unlockedKeys.length - 1) break;
  }

  const chosenKey = pickTonightsWorld(unlockedKeys, recentKeys, justUnlockedKey);
  const chosen = worlds.find((w) => w.key === chosenKey);
  if (!chosen) return null;

  return { key: chosen.key, name: chosen.name, icon: chosen.icon, hint: chosen.hint };
}
