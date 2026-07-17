import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma, WordLevel } from '@wortgarten/database';
import { DrillTaskTypeSchema, isIncomplete, resultIsCorrect, StatsByModeSchema } from '@wortgarten/shared';
import type { AddWordSourceType, StatsByMode, WordCard, WordDetail, WordFilter } from '@wortgarten/shared';
import { foldForLookup } from '@wortgarten/shared';
import { ZodError } from 'zod';
import { toLexemeSummary } from '../lexicon/lexeme-summary';
import { PrismaService } from '../../prisma/prisma.service';
import { SrsService } from '../srs/srs.service';

const LEVELS: WordLevel[] = ['NEW', 'RECOGNIZE', 'RECALL', 'PRODUCE', 'MASTERED'];
// The one rusty/retrievability threshold — HomeService and SessionBuilderService's rescue
// selection both import this instead of redeclaring 0.7, so the card, Progress, and the actual
// rescue session pool can never disagree on what counts as rusty.
export const RUSTY_THRESHOLD = 0.7;
const DEFAULT_PAGE_SIZE = 20;

const userWordWithLexeme = {
  sense: { include: { lexeme: true } },
} as const;

const userWordDetailInclude = {
  sense: { include: { lexeme: { include: { senses: true } } } },
} as const;

export interface AddWordInput {
  senseId: string;
  sourceSentence?: string;
  sourceType?: AddWordSourceType;
  customTranslation?: string;
  note?: string;
}

export interface ListWordsParams {
  q?: string;
  filter?: WordFilter;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class WordsService {
  private readonly logger = new Logger(WordsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly srs: SrsService,
  ) {}

  countForUser(userId: string): Promise<number> {
    return this.prisma.userWord.count({ where: { userId } });
  }

  async countByLevel(userId: string): Promise<Record<WordLevel, number>> {
    const rows = await this.prisma.userWord.groupBy({
      by: ['level'],
      where: { userId },
      _count: { _all: true },
    });

    const counts = Object.fromEntries(LEVELS.map((level) => [level, 0])) as Record<WordLevel, number>;
    for (const row of rows) counts[row.level] = row._count._all;
    return counts;
  }

  /** Candidates are filtered by dueAt in SQL; retrievability itself is computed in code, never in SQL. */
  async findRusty(userId: string, threshold = 0.7, now: Date = new Date()) {
    const candidates = await this.prisma.userWord.findMany({
      where: { userId, dueAt: { lte: now } },
      include: userWordWithLexeme,
    });

    return candidates
      .map((userWord) => ({ userWord, retrievability: this.srs.retrievability(userWord, now) }))
      .filter(({ retrievability }) => retrievability < threshold)
      .sort((a, b) => a.retrievability - b.retrievability);
  }

  findDue(userId: string, limit = 20, now: Date = new Date()) {
    return this.prisma.userWord.findMany({
      where: { userId, dueAt: { lte: now } },
      include: userWordWithLexeme,
      orderBy: { dueAt: 'asc' },
      take: limit,
    });
  }

  recentlyAdded(userId: string, limit = 3) {
    return this.prisma.userWord.findMany({
      where: { userId },
      include: userWordWithLexeme,
      orderBy: { addedAt: 'desc' },
      take: limit,
    });
  }

  /** Idempotent on (userId, senseId) — adding a sense you already have returns the existing row, not an error. */
  async addWord(userId: string, input: AddWordInput): Promise<{ id: string; created: boolean }> {
    const existing = await this.prisma.userWord.findUnique({
      where: { userId_senseId: { userId, senseId: input.senseId } },
    });
    if (existing) return { id: existing.id, created: false };

    const created = await this.prisma.userWord.create({
      data: {
        userId,
        senseId: input.senseId,
        level: 'NEW',
        dueAt: new Date(),
        sourceSentence: input.sourceSentence,
        sourceType: input.sourceType,
        customTranslation: input.customTranslation,
        note: input.note,
      },
    });
    return { id: created.id, created: true };
  }

  /** Inserts in one transaction, silently skipping senses already in the bank (or repeated within the batch). */
  async addWordsBatch(
    userId: string,
    items: { senseId: string; sourceSentence?: string }[],
    sourceType?: AddWordSourceType,
  ): Promise<{ id: string; senseId: string }[]> {
    const existing = await this.prisma.userWord.findMany({
      where: { userId, senseId: { in: items.map((i) => i.senseId) } },
      select: { senseId: true },
    });
    const existingSenseIds = new Set(existing.map((e) => e.senseId));

    const seen = new Set<string>();
    const toCreate = items.filter((item) => {
      if (existingSenseIds.has(item.senseId) || seen.has(item.senseId)) return false;
      seen.add(item.senseId);
      return true;
    });
    if (toCreate.length === 0) return [];

    const now = new Date();
    const created = await this.prisma.$transaction(
      toCreate.map((item) =>
        this.prisma.userWord.create({
          data: {
            userId,
            senseId: item.senseId,
            level: 'NEW',
            dueAt: now,
            sourceSentence: item.sourceSentence,
            sourceType,
          },
        }),
      ),
    );
    return created.map((c) => ({ id: c.id, senseId: c.senseId }));
  }

  /** Search/filter are done in SQL; retrievability (and therefore rustiness/sort order) is always computed in code. */
  async listWords(userId: string, params: ListWordsParams, now: Date = new Date()): Promise<{ items: WordCard[]; total: number }> {
    const { q, filter = 'all', page = 1, pageSize = DEFAULT_PAGE_SIZE } = params;
    const conditions: Prisma.UserWordWhereInput[] = [{ userId }];

    if (q?.trim()) {
      const trimmed = q.trim();
      const folded = foldForLookup(trimmed);
      conditions.push({
        sense: {
          OR: [
            { translation: { contains: trimmed, mode: 'insensitive' } },
            { lexeme: { lemma: { contains: trimmed, mode: 'insensitive' } } },
            { lexeme: { forms: { some: { normalized: { contains: folded } } } } },
          ],
        },
      });
    }

    if (filter === 'new') conditions.push({ level: 'NEW' });
    if (filter === 'mastered') conditions.push({ level: 'MASTERED' });
    if (filter === 'learning') conditions.push({ level: { in: ['RECOGNIZE', 'RECALL', 'PRODUCE'] } });
    if (filter === 'incomplete') {
      conditions.push({ sense: { lexeme: { partOfSpeech: 'NOUN', OR: [{ gender: null }, { plural: null }] } } });
    }

    const rows = await this.prisma.userWord.findMany({
      where: { AND: conditions },
      include: userWordWithLexeme,
    });

    let scored = rows.map((userWord) => ({ userWord, retrievability: this.srs.retrievability(userWord, now) }));

    if (filter === 'needs_attention') {
      scored = scored.filter(({ retrievability }) => retrievability < RUSTY_THRESHOLD);
    }

    scored.sort(
      (a, b) => a.retrievability - b.retrievability || a.userWord.dueAt.getTime() - b.userWord.dueAt.getTime(),
    );

    const total = scored.length;
    const start = (page - 1) * pageSize;
    const items: WordCard[] = scored.slice(start, start + pageSize).map(({ userWord, retrievability }) => ({
      id: userWord.id,
      lexeme: toLexemeSummary(userWord.sense.lexeme),
      translation: userWord.customTranslation ?? userWord.sense.translation,
      level: userWord.level,
      retrievability,
      isRusty: retrievability < RUSTY_THRESHOLD,
      isIncomplete: isIncomplete(userWord.sense.lexeme),
      dueAt: userWord.dueAt.toISOString(),
      addedAt: userWord.addedAt.toISOString(),
    }));

    return { items, total };
  }

  async getWordDetail(userId: string, id: string, now: Date = new Date()): Promise<WordDetail> {
    const userWord = await this.prisma.userWord.findUnique({
      where: { id },
      include: userWordDetailInclude,
    });
    if (!userWord || userWord.userId !== userId) {
      throw new NotFoundException('Word not found');
    }

    const retrievability = this.srs.retrievability(userWord, now);
    const lexeme = userWord.sense.lexeme;
    let statsByMode: StatsByMode;
    try {
      statsByMode = StatsByModeSchema.parse(userWord.statsByMode);
    } catch (error) {
      if (error instanceof ZodError) {
        this.logger.error(`Invalid statsByMode for UserWord ${userWord.id}`, error.stack);
      }
      throw error;
    }

    return {
      id: userWord.id,
      lexeme: toLexemeSummary(lexeme),
      senses: lexeme.senses.map((sense) => ({
        id: sense.id,
        translation: sense.translation,
        definition: sense.definition,
        example: sense.example,
        cefrLevel: sense.cefrLevel,
      })),
      activeSenseId: userWord.senseId,
      translation: userWord.customTranslation ?? userWord.sense.translation,
      example: userWord.sense.example,
      sourceSentence: userWord.sourceSentence,
      note: userWord.note,
      level: userWord.level,
      retrievability,
      isRusty: retrievability < RUSTY_THRESHOLD,
      isIncomplete: isIncomplete(lexeme),
      addedAt: userWord.addedAt.toISOString(),
      dueAt: userWord.dueAt.toISOString(),
      statsByMode,
    };
  }

  /** Rebuilds the display cache from its source of truth. Retry attempts and unsupported legacy modes are ignored. */
  async recomputeStatsFromAttempts(userWordId: string): Promise<StatsByMode> {
    const rows = await this.prisma.attempt.groupBy({
      by: ['taskType', 'result'],
      where: {
        userWordId,
        isRetry: false,
        taskType: { in: DrillTaskTypeSchema.options },
      },
      _count: { _all: true },
    });

    const stats: StatsByMode = {};
    for (const row of rows) {
      const parsedMode = DrillTaskTypeSchema.safeParse(row.taskType);
      if (!parsedMode.success) continue;
      const mode = parsedMode.data;
      const current = stats[mode] ?? { total: 0, correct: 0 };
      current.total += row._count._all;
      if (resultIsCorrect(row.result)) current.correct += row._count._all;
      stats[mode] = current;
    }

    const parsed = StatsByModeSchema.parse(stats);
    await this.prisma.userWord.update({
      where: { id: userWordId },
      data: { statsByMode: parsed as Prisma.InputJsonValue },
    });
    return parsed;
  }

  /** Only customTranslation/note are user-editable — dictionary data (lexeme/sense) never is. */
  async updateWord(
    userId: string,
    id: string,
    data: { customTranslation?: string | null; note?: string | null },
  ): Promise<{ id: string }> {
    const existing = await this.prisma.userWord.findUnique({ where: { id }, select: { userId: true } });
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException('Word not found');
    }
    const updated = await this.prisma.userWord.update({ where: { id }, data });
    return { id: updated.id };
  }

  async deleteWord(userId: string, id: string): Promise<{ id: string }> {
    const existing = await this.prisma.userWord.findUnique({ where: { id }, select: { userId: true } });
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException('Word not found');
    }
    await this.prisma.userWord.delete({ where: { id } });
    return { id };
  }
}
