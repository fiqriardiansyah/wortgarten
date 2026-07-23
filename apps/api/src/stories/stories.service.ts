import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AiService, LexemeResolver, generateStoryForUser, isEligibleForNewStory } from '@wortgarten/ai';
import type { GenerateStoryResult } from '@wortgarten/ai';
import { AudioService, deriveAudioUrl } from '@wortgarten/audio';
import type { Story as StoryRow } from '@wortgarten/database';
import { deriveCoverImageUrl, ImageService } from '@wortgarten/images';
import { isValidTimeZone, LibraryResponseSchema, localDateKey, StorySchema } from '@wortgarten/shared';
import type { LibraryResponse, ReadingLevel, SentenceTiming, Story, StoryAudioSync, StoryCadenceState, StoryGlossaryEntry, StoryParagraph } from '@wortgarten/shared';
import { PrismaService } from '../prisma/prisma.service';
import { WordsService } from '../modules/words/words.service';

// A simple, hand-picked tier ladder — not part of the story-generation spec, just what the
// frozen LibraryResponse contract needs to render the "reading level" rail without lying.
const READING_LEVEL_TIERS: { threshold: number; label: string }[] = [
  { threshold: 100, label: '2-minute stories' },
  { threshold: 200, label: '3-minute stories' },
  { threshold: 300, label: '5-minute stories' },
  { threshold: 500, label: '8-minute stories' },
  { threshold: 1000, label: '12-minute stories' },
];

function computeReadingLevel(wordsUnlocked: number): ReadingLevel {
  const next = READING_LEVEL_TIERS.find((t) => t.threshold > wordsUnlocked) ?? READING_LEVEL_TIERS[READING_LEVEL_TIERS.length - 1];
  return {
    wordsUnlocked,
    nextThreshold: next.threshold,
    nextUnlockLabel: next.label,
    wordsToGo: Math.max(0, next.threshold - wordsUnlocked),
  };
}

// The tokenMap's `status` is frozen at generation time and never rewritten when a "new" word is
// later added to the bank (see useStory.ts's markLexemeKnown — that flip only lives in the
// client's query cache and is gone on reload). Reconcile against the live bank on every read so a
// word added via "+ Add to my words" shows as known even after a full page refresh.
function toContractStory(row: StoryRow, isNewToday: boolean, knownLexemeIds: Set<string>): Story {
  const paragraphs = (row.paragraphs as unknown as StoryParagraph[]).map((paragraph) => ({
    tokens: paragraph.tokens.map((token) =>
      (token.status === 'new' || token.status === 'unknown') && token.lexemeId && knownLexemeIds.has(token.lexemeId)
        ? { ...token, status: 'known' as const }
        : token,
    ),
  }));

  return {
    id: row.id,
    title: row.title,
    blurb: row.blurb,
    status: 'READY',
    source: row.source,
    estMinutes: row.estMinutes,
    isNewToday,
    coverageKnownPct: row.coverageKnownPct,
    paragraphs,
    translation: row.translation,
    newWords: row.newWords.filter((lexemeId) => !knownLexemeIds.has(lexemeId)),
    glossary: row.glossary as unknown as Record<string, StoryGlossaryEntry>,
    createdAt: row.createdAt.toISOString(),
    isRead: row.readAt !== null,
    coverImageUrl: deriveCoverImageUrl(row.coverImageKey),
    audioUrl: deriveAudioUrl(row.audioKey),
    audioSync: row.audioSync as StoryAudioSync | null,
    sentenceTimings: row.sentenceTimings as unknown as SentenceTiming[] | null,
  };
}

@Injectable()
export class StoriesService {
  private readonly logger = new Logger(StoriesService.name);
  // Process-local guard against firing a second lazy generation for the same user while the
  // first is still running (e.g. the library refetching every few seconds while GENERATING shows).
  // No DB-backed "generating" flag exists — at this scale (see the story-generation doc's own v1
  // scope) an in-memory Set is enough; it never needs to survive a restart.
  private readonly generating = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly imageService: ImageService,
    private readonly audioService: AudioService,
    private readonly words: WordsService,
  ) {}

  private triggerLazyGeneration(userId: string): void {
    if (this.generating.has(userId)) return;
    this.generating.add(userId);

    const resolver = new LexemeResolver(this.prisma);
    // 'lazy': daytime, request-driven — remote-only inside generateStoryForUser, never loads the
    // local model into RAM while this API process is serving requests.
    generateStoryForUser(this.prisma, this.aiService, resolver, this.imageService, this.audioService, userId, 'lazy')
      .then((result) => this.logger.log(`lazy generation for ${userId}: ${JSON.stringify(result)}`))
      .catch((err) => this.logger.error(`lazy generation failed for ${userId}`, err))
      .finally(() => this.generating.delete(userId));
  }

  async listForUser(userId: string): Promise<LibraryResponse> {
    const rows = await this.prisma.story.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    const hasUnread = rows.some((r) => r.readAt === null);
    const firstUnreadIndex = rows.findIndex((r) => r.readAt === null);

    const knownLexemeIds = await this.words.getKnownLexemeIds(userId);
    const stories = rows.map((row, i) => toContractStory(row, i === firstUnreadIndex, knownLexemeIds));

    // Dormant users and users already sitting on an unread story never trigger a new one here —
    // isEligibleForNewStory enforces both, plus the one-new-story-per-day rule (User.timezone
    // day, same boundary the streak uses). Fire-and-forget: a 1-30s AI call has no business
    // blocking this request; a later refetch picks up the shipped story once it lands.
    const eligible = !hasUnread && (await isEligibleForNewStory(this.prisma, userId));
    if (eligible) this.triggerLazyGeneration(userId);

    // What to tell Home/Read about the NEXT story when there's no unread one sitting in `stories`
    // above: still eligible and not produced yet ('generating'), or today's one new story already
    // got read and the next only unlocks at the user's local midnight ('waitingTomorrow').
    // Computed once here — the single source both screens read, so they can never disagree.
    let pendingState: StoryCadenceState | null = null;
    if (!hasUnread) {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
      const timezone = user && isValidTimeZone(user.timezone) ? user.timezone : 'UTC';
      const latest = rows[0];
      const generatedToday = latest && localDateKey(latest.createdAt, timezone) === localDateKey(new Date(), timezone);
      pendingState = generatedToday ? 'waitingTomorrow' : 'generating';
    }

    const wordsUnlocked = await this.words.countForUser(userId);

    return LibraryResponseSchema.parse({ stories, readingLevel: computeReadingLevel(wordsUnlocked), pendingState });
  }

  /** Dev-only manual trigger — bypasses the one-story-per-day/unread eligibility gate entirely
   * so a developer can generate on demand. Still shares `generating` with the lazy path so a
   * click can't stack a second concurrent generation for the same user. Never wired for
   * production (see the controller's own guard). */
  async forceGenerateForDev(userId: string): Promise<GenerateStoryResult> {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Manual story generation is development-only');
    }
    if (this.generating.has(userId)) {
      return { status: 'skipped', reason: 'already_generating' };
    }
    this.generating.add(userId);
    try {
      const resolver = new LexemeResolver(this.prisma);
      const result = await generateStoryForUser(this.prisma, this.aiService, resolver, this.imageService, this.audioService, userId, 'lazy');
      this.logger.log(`dev force-generate for ${userId}: ${JSON.stringify(result)}`);
      return result;
    } finally {
      this.generating.delete(userId);
    }
  }

  async getById(userId: string, id: string): Promise<Story> {
    const row = await this.prisma.story.findUnique({ where: { id } });
    if (!row || row.userId !== userId) {
      throw new NotFoundException('Story not found');
    }

    const knownLexemeIds = await this.words.getKnownLexemeIds(userId);

    if (!row.readAt) {
      const updated = await this.prisma.story.update({ where: { id }, data: { readAt: new Date() } });
      return StorySchema.parse(toContractStory(updated, false, knownLexemeIds));
    }

    return StorySchema.parse(toContractStory(row, false, knownLexemeIds));
  }
}
