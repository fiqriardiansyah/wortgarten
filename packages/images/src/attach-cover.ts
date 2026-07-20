import type { PrismaClient } from '@wortgarten/database';
import type { ImageService } from './image.service';

function startOfUtcDay(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** The safety wiring around `ImageService` — the only thing callers need to know is that this can
 * always be `await`ed directly with no try/catch: it never throws, and it never affects whether
 * the story it's attached to already shipped. Call this only once, right after a story row is
 * created (see `generateStoryForUser`) — a freshly-created story always has `coverImageKey: null`,
 * so there's no re-generation guard needed here beyond that call-site invariant. */
export async function attachStoryCover(
  prisma: PrismaClient,
  imageService: ImageService,
  storyId: string,
  englishSummary: string,
): Promise<void> {
  try {
    if (process.env.STORY_IMAGES_ENABLED !== 'true') return;

    const maxPerDay = process.env.STORY_IMAGES_MAX_PER_DAY ? Number(process.env.STORY_IMAGES_MAX_PER_DAY) : null;
    if (maxPerDay !== null) {
      const usedToday = await prisma.story.count({
        where: { coverImageKey: { not: null }, createdAt: { gte: startOfUtcDay() } },
      });
      if (usedToday >= maxPerDay) {
        console.log(`[attachStoryCover] STORY_IMAGES_MAX_PER_DAY=${maxPerDay} reached, skipping cover for story ${storyId}`);
        return;
      }
    }

    const result = await imageService.generateStoryCover({ storyId, englishSummary });
    if (!result.ok) {
      console.error(`[attachStoryCover] cover generation failed for story ${storyId}: ${result.error}`);
      return;
    }

    await prisma.story.update({ where: { id: storyId }, data: { coverImageKey: result.key } });
  } catch (err) {
    console.error(`[attachStoryCover] unexpected error for story ${storyId}:`, err);
  }
}
