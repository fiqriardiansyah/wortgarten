import { Injectable } from '@nestjs/common';
import type { WordLevel } from '@wortgarten/database';
import { PrismaService } from '../../prisma/prisma.service';
import { SrsService } from '../srs/srs.service';

const LEVELS: WordLevel[] = ['NEW', 'RECOGNIZE', 'RECALL', 'PRODUCE', 'MASTERED'];

const userWordWithLexeme = {
  sense: { include: { lexeme: true } },
} as const;

@Injectable()
export class WordsService {
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
}
