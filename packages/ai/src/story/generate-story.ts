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

export type GenerateStoryResult = { status: 'shipped'; storyId: string } | { status: 'skipped'; reason: string };

/**
 * The full pipeline: select vocabulary (plain code) → run the STORY AiJob through the existing
 * spine (router/quota/retry/fallback, checker-guaranteed) → build the frozen tokenMap/glossary →
 * validate against the shared contract → persist. Never stores a story that failed the checker —
 * `aiService.run` already exhausted retries + fallback before returning `ok:false`.
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
  const estMinutes = Math.max(1, Math.round(built.totalWordCount / LEARNER_WORDS_PER_MINUTE));
  const translation = draft.translation ?? null;

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
    translation,
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
      translation,
      paragraphs: built.paragraphs as unknown as Prisma.InputJsonValue,
      glossary: built.glossary as unknown as Prisma.InputJsonValue,
      newWords: built.newWords,
      coverageKnownPct: built.coverageKnownPct,
      estMinutes,
      source: result.provider,
    },
  });

  return { status: 'shipped', storyId: created.id };
}
