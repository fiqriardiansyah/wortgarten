import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AiService, LexemeResolver, PrismaService, STORY_ELIGIBLE_ACTIVE_DAYS, generateStoryForUser, isEligibleForNewStory } from '@wortgarten/ai';
import { WorkerModule } from '../worker.module';

// Guardrail 2: never run past sunrise. Both are config, not vague "run until done" — the batch
// stops at whichever limit it hits first and leaves the rest for tomorrow's run.
const STORY_BATCH_MAX = Number(process.env.STORY_BATCH_MAX ?? 200);
const STORY_BATCH_DEADLINE = process.env.STORY_BATCH_DEADLINE ?? '05:30';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function pastDeadline(deadline: string): boolean {
  const [hourStr, minuteStr] = deadline.split(':');
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const now = new Date();
  return now.getHours() > hour || (now.getHours() === hour && now.getMinutes() >= minute);
}

async function main() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  const aiService = app.get(AiService);
  const prisma = app.get(PrismaService);
  const resolver = new LexemeResolver(prisma);

  const activeSince = new Date(Date.now() - STORY_ELIGIBLE_ACTIVE_DAYS * MS_PER_DAY);

  // Recently active AND not already sitting on an unread story — a cheap SQL pre-filter so the
  // per-candidate loop below isn't a round trip per user just to find out most users don't
  // qualify. This is NOT the authoritative check: isEligibleForNewStory (called per candidate
  // below) also enforces the one-story-per-day rule, which needs each user's own timezone and
  // isn't worth expressing as SQL here — it's the same function apps/api's lazy trigger uses, so
  // batch and lazy can never disagree about who's eligible.
  const candidates = await prisma.user.findMany({
    where: {
      drillSessions: { some: { startedAt: { gte: activeSince } } },
      stories: { none: { readAt: null } },
    },
    select: { id: true, drillSessions: { orderBy: { startedAt: 'desc' }, take: 1, select: { startedAt: true } } },
  });

  // Most-recently-active first — if the cap or deadline cuts the run short, the users most
  // likely to open the app again soonest are the ones who got a story.
  candidates.sort((a, b) => (b.drillSessions[0]?.startedAt.getTime() ?? 0) - (a.drillSessions[0]?.startedAt.getTime() ?? 0));

  let attempted = 0;
  let shipped = 0;
  let skipped = 0;
  let deferredByCap = 0;

  for (let i = 0; i < candidates.length; i++) {
    if (attempted >= STORY_BATCH_MAX) {
      deferredByCap = candidates.length - i;
      console.log(`[story:batch] hit STORY_BATCH_MAX=${STORY_BATCH_MAX}, deferring ${deferredByCap} users to tomorrow`);
      break;
    }
    if (pastDeadline(STORY_BATCH_DEADLINE)) {
      deferredByCap = candidates.length - i;
      console.log(`[story:batch] past deadline ${STORY_BATCH_DEADLINE}, deferring ${deferredByCap} users to tomorrow`);
      break;
    }

    const user = candidates[i];

    // The authoritative check — also enforces "no story already generated today" (user's
    // timezone). Doesn't count against STORY_BATCH_MAX or the deadline: it's a cheap DB read, not
    // an AI call, and re-running this script twice in one night should cost nothing extra.
    if (!(await isEligibleForNewStory(prisma, user.id))) {
      skipped++;
      console.log(`[story:batch] skipped user ${user.id}: not_eligible`);
      continue;
    }

    attempted++;
    const result = await generateStoryForUser(prisma, aiService, resolver, user.id, 'batch');
    if (result.status === 'shipped') {
      shipped++;
      console.log(`[story:batch] shipped story ${result.storyId} for user ${user.id}`);
    } else {
      skipped++;
      console.log(`[story:batch] skipped user ${user.id}: ${result.reason}`);
    }
  }

  console.log(
    `[story:batch] done — eligible=${candidates.length} attempted=${attempted} shipped=${shipped} skipped=${skipped} deferredByCap=${deferredByCap}`,
  );

  await app.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('[story:batch] crashed:', err);
  process.exit(1);
});
