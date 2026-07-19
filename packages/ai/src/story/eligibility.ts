import type { PrismaClient } from '@wortgarten/database';
import { isValidTimeZone, localDateKey } from '@wortgarten/shared';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Config-driven, not vague "active": a dormant user (no session in this many days) gets no new
 * story until they return. Read directly from process.env — same per-package convention as
 * packages/ai's other env-driven defaults (see AiModule's GROQ_DAILY_LIMIT/AI_MAX_RETRIES). */
export const STORY_ELIGIBLE_ACTIVE_DAYS = Number(process.env.STORY_ELIGIBLE_ACTIVE_DAYS ?? 7);

/**
 * Shared by both apps/worker's nightly batch and apps/api's lazy on-demand trigger, so they can
 * never disagree about who's eligible: recently active (drilled within STORY_ELIGIBLE_ACTIVE_DAYS),
 * no story already generated today (User.timezone, same day boundary the streak uses), AND not
 * already sitting on an unread story. Does not check "enough known words" — that's
 * selectStoryVocabulary's job, and its own null return already means "skip this user".
 *
 * The daily check is derived from the newest Story.createdAt, never a counter column — and only
 * ever counts a story that actually landed in the DB. A generation that failed the checker or the
 * coverage floor never created a row, so it never costs the user their day.
 */
export async function isEligibleForNewStory(prisma: PrismaClient, userId: string, now: Date = new Date()): Promise<boolean> {
  const activeSince = new Date(now.getTime() - STORY_ELIGIBLE_ACTIVE_DAYS * MS_PER_DAY);

  const [user, recentSession, unreadStory, latestStory] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } }),
    prisma.drillSession.findFirst({ where: { userId, startedAt: { gte: activeSince } }, select: { id: true } }),
    prisma.story.findFirst({ where: { userId, readAt: null }, select: { id: true } }),
    prisma.story.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
  ]);

  if (!recentSession) return false; // dormant
  if (unreadStory) return false; // one already waiting

  const timezone = user && isValidTimeZone(user.timezone) ? user.timezone : 'UTC';
  if (latestStory && localDateKey(latestStory.createdAt, timezone) === localDateKey(now, timezone)) {
    return false; // already generated today
  }

  return true;
}
