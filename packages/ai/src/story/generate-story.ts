import type { Prisma, PrismaClient } from '@wortgarten/database';
import { attachStoryAudio, type AudioService } from '@wortgarten/audio';
import { attachStoryCover, type ImageService } from '@wortgarten/images';
import { StorySchema } from '@wortgarten/shared';
import type { StoryDraft } from '@wortgarten/shared';
import type { AiService } from '../ai.service';
import { buildStoryFromDraft } from './build-story-tokens';
import type { LexemeResolver } from './lexeme-resolver';
import { selectStoryVocabulary } from './select-vocabulary';
import { buildStoryJob } from './story-job';

// A learner's tap-heavy reading pace, not a fluent reader's — deliberately slower than typical
// adult reading speed so estMinutes doesn't undersell how long an A1-A2 story actually takes.
const LEARNER_WORDS_PER_MINUTE = 45;

// Below this, a shipped story would teach more noise than signal. This is a quality floor, not a
// checker rejection: aiService.run already succeeded, so a low-coverage draft is skipped outright
// rather than retried or handed to the other provider — one generation, one outcome.
const STORY_MIN_COVERAGE_PCT = Number(process.env.STORY_MIN_COVERAGE_PCT ?? 70);

export type GenerateStoryResult = { status: 'shipped'; storyId: string } | { status: 'skipped'; reason: string };

// 'lazy' = daytime, request-driven (apps/api's GET /stories fire-and-forget). 'batch' = the
// overnight worker. The only behavioral difference is which providers `aiService.run` may use —
// see the `remoteOnly` call below and AiService.run's own doc comment.
export type StoryTriggerContext = 'lazy' | 'batch';

/**
 * Upserts occurrence counts for surface forms the resolver couldn't place at all — a diagnostic
 * for a human to read offline, never a write to Lexeme/Sense. Best-effort per surface: a logging
 * failure must never fail an otherwise-shipped story.
 */
async function recordUnresolvedSurfaces(prisma: PrismaClient, language: string, surfaces: string[], sampleStoryId: string): Promise<void> {
  const occurrencesBySurface = new Map<string, number>();
  for (const surface of surfaces) occurrencesBySurface.set(surface, (occurrencesBySurface.get(surface) ?? 0) + 1);

  for (const [surface, occurrences] of occurrencesBySurface) {
    await prisma.unresolvedStoryWord
      .upsert({
        where: { language_surface: { language, surface } },
        create: { language, surface, occurrences, sampleStoryId },
        update: { occurrences: { increment: occurrences }, lastSeenAt: new Date(), sampleStoryId },
      })
      .catch((err) => console.error(`[generateStoryForUser] failed to record unresolved surface "${surface}":`, err));
  }
}

/**
 * The full pipeline: select vocabulary (plain code) → run the STORY AiJob through the existing
 * spine (router/quota/retry/fallback, shape-guaranteed) → build the frozen tokenMap/glossary →
 * validate against the shared contract → persist. Never stores a story that failed the checker —
 * `aiService.run` already exhausted retries + fallback before returning `ok:false`. Vocabulary
 * never rejects a draft here either; the only thing that can stop a story from shipping past this
 * point is the coverage quality floor below.
 */
export async function generateStoryForUser(
  prisma: PrismaClient,
  aiService: AiService,
  resolver: LexemeResolver,
  imageService: ImageService,
  audioService: AudioService,
  userId: string,
  triggerContext: StoryTriggerContext = 'batch',
  language = 'de',
): Promise<GenerateStoryResult> {
  console.log(`[generateStoryForUser] in: userId=${userId} trigger=${triggerContext} language=${language}`);

  const vocab = await selectStoryVocabulary(prisma, userId, language);
  if (!vocab) {
    console.log(`[generateStoryForUser] out: skipped (too_few_known_words) userId=${userId}`);
    return { status: 'skipped', reason: 'too_few_known_words' };
  }

  const job = buildStoryJob(vocab);
  // Daytime (lazy) generation must never load the local model into RAM while the API is serving —
  // remoteOnly means this call either uses GROQ or doesn't run at all (see AiService.run).
  const result = await aiService.run(job, { remoteOnly: triggerContext === 'lazy' });
  if (!result.ok) {
    console.error(`[generateStoryForUser] out: skipped (${result.reason}) userId=${userId} detail=${result.detail}`);
    return { status: 'skipped', reason: result.reason };
  }

  const draft = result.value as StoryDraft;
  const built = await buildStoryFromDraft(resolver, vocab, draft, language);

  if (built.coverageKnownPct < STORY_MIN_COVERAGE_PCT) {
    console.log(`[generateStoryForUser] out: skipped (low_coverage_${built.coverageKnownPct}pct) userId=${userId}`);
    return { status: 'skipped', reason: `low_coverage_${built.coverageKnownPct}pct` };
  }

  const estMinutes = Math.max(1, Math.round(built.totalWordCount / LEARNER_WORDS_PER_MINUTE));

  // Validate the finished shape against the frozen contract before writing anything. `id` and
  // `createdAt` stand in for what Prisma assigns on create (the schema requires them, but they
  // don't exist until the row does) — everything else here is the real, final content.
  StorySchema.parse({
    id: 'pending',
    title: draft.title,
    blurb: null,
    status: 'READY',
    source: result.provider,
    estMinutes,
    isNewToday: true,
    coverageKnownPct: built.coverageKnownPct,
    paragraphs: built.paragraphs,
    translation: built.translation,
    newWords: built.newWords,
    glossary: built.glossary,
    createdAt: new Date().toISOString(),
    isRead: false,
    coverImageUrl: null,
    audioUrl: null,
    audioSync: null,
    sentenceTimings: null,
  });

  const created = await prisma.story.create({
    data: {
      userId,
      title: draft.title,
      blurb: null,
      translation: built.translation,
      paragraphs: built.paragraphs as unknown as Prisma.InputJsonValue,
      glossary: built.glossary as unknown as Prisma.InputJsonValue,
      newWords: built.newWords,
      coverageKnownPct: built.coverageKnownPct,
      estMinutes,
      source: result.provider,
    },
  });
  console.log(`[generateStoryForUser] story row created: storyId=${created.id} userId=${userId}`);

  if (built.unresolvedSurfaces.length > 0) {
    await recordUnresolvedSurfaces(prisma, language, built.unresolvedSurfaces, created.id);
  }

  // Story-first, picture-second: the row above is already complete and readable. This can never
  // throw and never affects the result below — see attachStoryCover's own doc comment.
  await attachStoryCover(prisma, imageService, created.id, built.translation ?? draft.title);

  // Same "already shipped" ordering as the cover — Listen Mode audio is a bonus layer that can
  // never block, delay, or fail the story. See attachStoryAudio's own doc comment.
  await attachStoryAudio(prisma, audioService, created.id, built.paragraphs);

  console.log(`[generateStoryForUser] out: shipped storyId=${created.id} userId=${userId} provider=${result.provider} coverage=${built.coverageKnownPct}pct`);
  return { status: 'shipped', storyId: created.id };
}
