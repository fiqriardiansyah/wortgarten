import { Prisma, type PrismaClient } from '@wortgarten/database';
import type { StoryParagraph } from '@wortgarten/shared';
import type { AudioService } from './audio.service';

/** The safety wiring around `AudioService` — mirrors `packages/images`'s `attachStoryCover`
 * exactly. Callers only need to know this can always be `await`ed directly with no try/catch: it
 * never throws, and it never affects whether the story it's attached to already shipped. Call this
 * only once, right after a story row is created — a freshly-created story always has
 * `audioKey: null`, so there's no re-generation guard needed here beyond that call-site invariant. */
export async function attachStoryAudio(
  prisma: PrismaClient,
  audioService: AudioService,
  storyId: string,
  paragraphs: StoryParagraph[],
): Promise<void> {
  try {
    if (process.env.STORY_AUDIO_ENABLED !== 'true') return;

    const result = await audioService.generateStoryAudio({ storyId, paragraphs });
    if (!result.ok) {
      console.error(`[attachStoryAudio] audio generation failed for story ${storyId}: ${result.error}`);
      return;
    }

    await prisma.story.update({
      where: { id: storyId },
      data: {
        audioKey: result.audioKey,
        audioSync: result.audioSync,
        sentenceTimings: result.sentenceTimings === null ? Prisma.DbNull : (result.sentenceTimings as unknown as Prisma.InputJsonValue),
        paragraphs: result.paragraphs as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    console.error(`[attachStoryAudio] unexpected error for story ${storyId}:`, err);
  }
}
