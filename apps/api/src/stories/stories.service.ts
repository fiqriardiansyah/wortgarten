import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AiService, LexemeResolver, generateStoryForUser, isEligibleForNewStory } from '@wortgarten/ai';
import type { Story as StoryRow } from '@wortgarten/database';
import { LibraryResponseSchema, StorySchema } from '@wortgarten/shared';
import type { LibraryResponse, ReadingLevel, Story, StoryGlossaryEntry, StoryParagraph } from '@wortgarten/shared';
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

function toContractStory(row: StoryRow, isNewToday: boolean): Story {
  return {
    id: row.id,
    title: row.title,
    blurb: row.blurb,
    status: 'READY',
    source: row.source,
    estMinutes: row.estMinutes,
    isNewToday,
    coverageKnownPct: row.coverageKnownPct,
    paragraphs: row.paragraphs as unknown as StoryParagraph[],
    translation: row.translation,
    newWords: row.newWords,
    glossary: row.glossary as unknown as Record<string, StoryGlossaryEntry>,
    createdAt: row.createdAt.toISOString(),
    isRead: row.readAt !== null,
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
    private readonly words: WordsService,
  ) {}

  private triggerLazyGeneration(userId: string): void {
    if (this.generating.has(userId)) return;
    this.generating.add(userId);

    const resolver = new LexemeResolver(this.prisma);
    generateStoryForUser(this.prisma, this.aiService, resolver, userId)
      .then((result) => this.logger.log(`lazy generation for ${userId}: ${JSON.stringify(result)}`))
      .catch((err) => this.logger.error(`lazy generation failed for ${userId}`, err))
      .finally(() => this.generating.delete(userId));
  }

  async listForUser(userId: string): Promise<LibraryResponse> {
    const rows = await this.prisma.story.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    const hasUnread = rows.some((r) => r.readAt === null);
    const firstUnreadIndex = rows.findIndex((r) => r.readAt === null);

    const stories = rows.map((row, i) => toContractStory(row, i === firstUnreadIndex));

    // Dormant users and users already sitting on an unread story never trigger a new one here —
    // isEligibleForNewStory enforces both. Fire-and-forget: a 1-30s AI call has no business
    // blocking this request; a later refetch picks up the shipped story once it lands.
    const eligible = !hasUnread && (await isEligibleForNewStory(this.prisma, userId));
    if (eligible) this.triggerLazyGeneration(userId);

    const wordsUnlocked = await this.words.countForUser(userId);

    return LibraryResponseSchema.parse({ stories, readingLevel: computeReadingLevel(wordsUnlocked) });
  }

  async getById(userId: string, id: string): Promise<Story> {
    const row = await this.prisma.story.findUnique({ where: { id } });
    if (!row || row.userId !== userId) {
      throw new NotFoundException('Story not found');
    }

    if (!row.readAt) {
      const updated = await this.prisma.story.update({ where: { id }, data: { readAt: new Date() } });
      return StorySchema.parse(toContractStory(updated, false));
    }

    return StorySchema.parse(toContractStory(row, false));
  }
}
