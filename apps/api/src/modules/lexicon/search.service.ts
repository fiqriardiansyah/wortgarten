import { Injectable } from '@nestjs/common';
import { foldForLookup } from '@wortgarten/shared';
import type { LexiconSearchResult } from '@wortgarten/shared';
import { PrismaService } from '../../prisma/prisma.service';

const DEFAULT_LIMIT = 20;

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Forgiving, two-way dictionary search: "dog" finds "der Hund" via Sense.translation,
   * "Hund"/"fur" find it via Lexeme.lemma / the umlaut-folded WordForm.normalized index.
   * Ordered by frequencyRank (nulls last) so common words surface first.
   */
  async search(query: string, userId: string, language = 'de', limit = DEFAULT_LIMIT): Promise<LexiconSearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const folded = foldForLookup(trimmed);

    const lexemes = await this.prisma.lexeme.findMany({
      where: {
        language,
        OR: [
          { lemma: { contains: trimmed, mode: 'insensitive' } },
          { senses: { some: { translation: { contains: trimmed, mode: 'insensitive' } } } },
          { forms: { some: { normalized: { contains: folded } } } },
        ],
      },
      include: { senses: true },
      orderBy: [{ frequencyRank: { sort: 'asc', nulls: 'last' } }, { lemma: 'asc' }],
      take: limit,
    });

    const senseIds = lexemes.flatMap((lexeme) => lexeme.senses.map((sense) => sense.id));
    const owned = await this.prisma.userWord.findMany({
      where: { userId, senseId: { in: senseIds } },
      select: { senseId: true },
    });
    const ownedSenseIds = new Set(owned.map((o) => o.senseId));

    return lexemes.map((lexeme) => ({
      lexeme,
      senses: lexeme.senses.map((sense) => ({ ...sense, inBank: ownedSenseIds.has(sense.id) })),
    }));
  }
}
