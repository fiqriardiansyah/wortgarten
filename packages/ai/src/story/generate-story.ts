import type { Prisma, PrismaClient } from '@wortgarten/database';
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
  userId: string,
  language = 'de',
): Promise<GenerateStoryResult> {
  const vocab = await selectStoryVocabulary(prisma, userId, language);
  if (!vocab) return { status: 'skipped', reason: 'too_few_known_words' };

  const job = buildStoryJob(vocab);
  const result = await aiService.run(job);
  if (!result.ok) return { status: 'skipped', reason: result.reason };

  const draft = result.value as StoryDraft;
  const built = await buildStoryFromDraft(resolver, vocab, draft, language);

  if (built.coverageKnownPct < STORY_MIN_COVERAGE_PCT) {
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

  if (built.unresolvedSurfaces.length > 0) {
    await recordUnresolvedSurfaces(prisma, language, built.unresolvedSurfaces, created.id);
  }

  return { status: 'shipped', storyId: created.id };
}
