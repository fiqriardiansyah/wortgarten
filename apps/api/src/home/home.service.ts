import { Injectable } from '@nestjs/common';
import {
  HomeDashboard,
  HomeDashboardSchema,
  PlanSchema,
  type HomeStoryCard,
  type SessionSummary,
  type Story,
  type StoryCadenceState,
  type WordLevel as ContractWordLevel,
} from '@wortgarten/shared';
import { MIN_KNOWN_WORDS_FOR_STORY } from '@wortgarten/ai';
import type { DrillSession, WordLevel } from '@wortgarten/database';
import { PrismaService } from '../prisma/prisma.service';
import { SessionBuilderService } from '../modules/session/session-builder.service';
import { RUSTY_THRESHOLD, WordsService } from '../modules/words/words.service';
import { isValidTimeZone, StreakService } from '../streak/streak.service';
import { StoriesService } from '../stories/stories.service';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MINUTES_PER_TASK = 0.5;

// Collapses the 5-rung learning ladder to the 3-bucket shape the Home
// contract (and its UI) already speak — the contract stays unchanged.
function toContractLevel(level: WordLevel): ContractWordLevel {
  if (level === 'NEW') return 'new';
  if (level === 'MASTERED') return 'mastered';
  return 'learning';
}

function taskTypeForLevel(level: WordLevel): 'flashcards' | 'recalls' | 'sentenceBuilds' {
  switch (level) {
    case 'NEW':
    case 'RECOGNIZE':
      return 'flashcards';
    case 'RECALL':
      return 'recalls';
    case 'PRODUCE':
    case 'MASTERED':
      return 'sentenceBuilds';
  }
}

@Injectable()
export class HomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly words: WordsService,
    private readonly sessionBuilder: SessionBuilderService,
    private readonly streaks: StreakService,
    private readonly stories: StoriesService,
  ) {}

  async getDashboard(userId: string, reportedTimezone?: string): Promise<HomeDashboard> {
    let user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (reportedTimezone && reportedTimezone !== user.timezone && isValidTimeZone(reportedTimezone)) {
      user = await this.prisma.user.update({ where: { id: userId }, data: { timezone: reportedTimezone } });
    }

    const [activeSession, rusty, collected, byLevel, recentlyAdded, streak, library] = await Promise.all([
      this.prisma.drillSession.findFirst({ where: { userId, status: 'ACTIVE' }, orderBy: { startedAt: 'desc' } }),
      this.words.findRusty(userId, RUSTY_THRESHOLD),
      this.words.countForUser(userId),
      this.words.countByLevel(userId),
      this.words.recentlyAdded(userId, 3),
      this.streaks.computeStreak(userId, user.timezone),
      // Same StoriesService the Read page's GET /stories uses — Home and Read can never disagree
      // about whether a story exists. Also carries the same lazy-generation side effect.
      this.stories.listForUser(userId),
    ]);
    const knownWordCount = byLevel.RECOGNIZE + byLevel.RECALL + byLevel.PRODUCE + byLevel.MASTERED;
    const storyCard = this.buildStoryCard(library.stories, library.pendingState, knownWordCount, collected);

    const rustyUserWordIds = new Set(rusty.map((r) => r.userWord.id));

    // Same due-first + capped-NEW selection the session builder uses to actually build a session —
    // sharing that code is what keeps this preview and the real session from ever disagreeing.
    const sessionSummary = activeSession
      ? this.buildActiveSessionSummary(activeSession)
      : await this.buildStartSessionSummary(userId);

    const daysSinceJoined = Math.floor((Date.now() - user.createdAt.getTime()) / MS_PER_DAY) + 1;
    const firstName = user.name.split(' ')[0] || user.name;

    const dashboard: HomeDashboard = {
      greeting: `Hallo, ${firstName}! 👋`,
      daySubtitle: `Day ${daysSinceJoined} of learning German`,
      streak,
      session: sessionSummary,
      rusty: {
        count: rusty.length,
        wordsPreview: rusty.slice(0, 3).map((r) => r.userWord.sense.lexeme.lemma),
        extraCount: Math.max(0, rusty.length - 3),
      },
      quest: {
        // TODO: no quest table yet — placeholder until a later task adds one
        label: 'Master 10 words this week',
        current: 0,
        target: 10,
        rewardLabel: 'Keep going to earn your gold star ⭐',
      },
      garden: {
        collected,
        mastered: byLevel.MASTERED,
        segments: {
          new: byLevel.NEW,
          learning: byLevel.RECOGNIZE + byLevel.RECALL + byLevel.PRODUCE,
          mastered: byLevel.MASTERED,
        },
      },
      story: storyCard,
      recentlyAdded: recentlyAdded.map((w) => ({
        german: w.sense.lexeme.lemma,
        native: w.customTranslation ?? w.sense.translation,
        level: toContractLevel(w.level),
        isRusty: rustyUserWordIds.has(w.id),
      })),
      user: {
        name: user.name,
        tagline: user.tagline ?? 'Learning German 🇩🇪',
      },
    };

    return HomeDashboardSchema.parse(dashboard);
  }

  /** "Resume session · N left" — N is the frozen plan's non-retry length minus how far in the user
   * already got, so it can never disagree with what SessionPage shows after resuming. */
  private buildActiveSessionSummary(session: DrillSession): SessionSummary {
    const totalCount = PlanSchema.parse(session.plan).filter((item) => !item.isRetry).length;
    const remaining = Math.max(0, totalCount - session.currentIndex);
    return {
      wordCount: remaining,
      estMinutes: Math.ceil(remaining * MINUTES_PER_TASK),
      taskBreakdown: { flashcards: 0, recalls: 0, sentenceBuilds: 0 },
      previewWords: [],
      isActive: true,
    };
  }

  /** "Start session · N words" — N and the breakdown/preview come straight out of the builder's
   * own composePlan selection (SessionBuilderService.planPreview), never recomputed separately. */
  private async buildStartSessionSummary(userId: string): Promise<SessionSummary> {
    const preview = await this.sessionBuilder.planPreview(userId);

    const taskBreakdown = { flashcards: 0, recalls: 0, sentenceBuilds: 0 };
    for (const word of preview.words) {
      taskBreakdown[taskTypeForLevel(word.level)] += 1;
    }

    return {
      wordCount: preview.total,
      estMinutes: Math.ceil(preview.total * MINUTES_PER_TASK),
      taskBreakdown,
      previewWords: preview.words.slice(0, 3).map((w) => w.sense.lexeme.lemma),
      isActive: false,
    };
  }

  /** Same states as the Read page's own hero/pending split (ReadPage.tsx), so the two screens
   * can never disagree about whether a story exists. `library.stories`/`pendingState` both come
   * from StoriesService.listForUser — the exact same source GET /stories serves. */
  private buildStoryCard(stories: Story[], pendingState: StoryCadenceState | null, knownWordCount: number, totalWordCount: number): HomeStoryCard {
    const ready = stories.find((s) => s.status === 'READY' && s.isNewToday);
    if (ready) {
      return {
        state: 'ready',
        id: ready.id,
        title: ready.title,
        estMinutes: ready.estMinutes,
        isFullyKnown: ready.coverageKnownPct === 100,
        isNewToday: ready.isNewToday,
      };
    }

    if (knownWordCount < MIN_KNOWN_WORDS_FOR_STORY) {
      // Bank already has enough words to clear the floor once they level up — the fix is
      // practice, not adding more. Otherwise even mastering everything banked wouldn't be enough.
      return {
        state: 'locked',
        wordsToGo: MIN_KNOWN_WORDS_FOR_STORY - knownWordCount,
        needsPractice: totalWordCount >= MIN_KNOWN_WORDS_FOR_STORY,
      };
    }

    // Enough known words, no unread story — pendingState says which of the two remaining honest
    // states applies: still eligible and not produced yet, or today's one story already read and
    // the next only unlocks at the user's local midnight.
    if (pendingState === 'waitingTomorrow') return { state: 'waitingTomorrow' };
    return { state: 'generating' };
  }
}
