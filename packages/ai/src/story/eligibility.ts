import type { PrismaClient } from '@wortgarten/database';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Config-driven, not vague "active": a dormant user (no session in this many days) gets no new
 * story until they return. Read directly from process.env — same per-package convention as
 * packages/ai's other env-driven defaults (see AiModule's GROQ_DAILY_LIMIT/AI_MAX_RETRIES). */
export const STORY_ELIGIBLE_ACTIVE_DAYS = Number(process.env.STORY_ELIGIBLE_ACTIVE_DAYS ?? 7);

/**
 * Shared by both apps/worker's nightly batch and apps/api's lazy on-demand trigger, so they can
 * never disagree about who's eligible: recently active (drilled within STORY_ELIGIBLE_ACTIVE_DAYS)
 * AND not already sitting on an unread story. Does not check "enough known words" — that's
 * selectStoryVocabulary's job, and its own null return already means "skip this user".
 */
export async function isEligibleForNewStory(prisma: PrismaClient, userId: string, now: Date = new Date()): Promise<boolean> {
  const activeSince = new Date(now.getTime() - STORY_ELIGIBLE_ACTIVE_DAYS * MS_PER_DAY);

  const [recentSession, unreadStory] = await Promise.all([
    prisma.drillSession.findFirst({ where: { userId, startedAt: { gte: activeSince } }, select: { id: true } }),
    prisma.story.findFirst({ where: { userId, readAt: null }, select: { id: true } }),
  ]);

  if (!recentSession) return false; // dormant
  if (unreadStory) return false; // one already waiting
  return true;
}
