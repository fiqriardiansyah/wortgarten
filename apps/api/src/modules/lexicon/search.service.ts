import { Injectable } from '@nestjs/common';
import { foldForLookup } from '@wortgarten/shared';
import type { LexiconSearchResult } from '@wortgarten/shared';
import type { Lexeme, Sense } from '@wortgarten/database';
import { PrismaService } from '../../prisma/prisma.service';

const DEFAULT_LIMIT = 20;
const CANDIDATES_PER_TIER = DEFAULT_LIMIT * 3; // headroom so frequencyRank can pick winners within each tier before the final slice

type LexemeWithSenses = Lexeme & { senses: Sense[] };

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Forgiving, two-way dictionary search: "dog" finds "der Hund" via Sense.translation,
   * "Hund"/"fur" find it via Lexeme.lemma / the umlaut-folded WordForm.normalized index.
   *
   * Ordered by tier first, frequencyRank (nulls last) within a tier second — a German
   * lemma match must always outrank a substring hit inside an English translation (e.g.
   * "bank" must surface "die Bank" above "ausgeben", whose gloss merely contains the
   * substring "banknotes"):
   *   0. Exact German lemma match
   *   1. German lemma prefix match
   *   2. German form match (via WordForm — inflections, umlaut-folded)
   *   3. English translation match: whole-word first, then substring
   */
  async search(query: string, userId: string, language = 'de', limit = DEFAULT_LIMIT): Promise<LexiconSearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const folded = foldForLookup(trimmed);
    const byFrequency = [{ frequencyRank: { sort: 'asc' as const, nulls: 'last' as const } }, { lemma: 'asc' as const }];
    const include = { senses: true };

    const [exactLemma, prefixLemma, formMatch, translationMatch] = await Promise.all([
      this.prisma.lexeme.findMany({
        where: { language, lemma: { equals: trimmed, mode: 'insensitive' } },
        include,
        orderBy: byFrequency,
        take: CANDIDATES_PER_TIER,
      }),
      this.prisma.lexeme.findMany({
        where: { language, lemma: { startsWith: trimmed, mode: 'insensitive' } },
        include,
        orderBy: byFrequency,
        take: CANDIDATES_PER_TIER,
      }),
      this.prisma.lexeme.findMany({
        where: { language, forms: { some: { normalized: { contains: folded } } } },
        include,
        orderBy: byFrequency,
        take: CANDIDATES_PER_TIER,
      }),
      this.prisma.lexeme.findMany({
        where: { language, senses: { some: { translation: { contains: trimmed, mode: 'insensitive' } } } },
        include,
        orderBy: byFrequency,
        take: CANDIDATES_PER_TIER,
      }),
    ]);

    const wordBoundary = new RegExp(`\\b${escapeRegExp(trimmed)}\\b`, 'i');
    const isWholeWordTranslationMatch = (lexeme: LexemeWithSenses) => lexeme.senses.some((s) => wordBoundary.test(s.translation));

    const tierOf = new Map<string, number>();
    const byId = new Map<string, LexemeWithSenses>();
    const assignTier = (lexemes: LexemeWithSenses[], tier: number) => {
      for (const lexeme of lexemes) {
        if (tierOf.has(lexeme.id)) continue; // first (highest-priority) tier a lexeme appears in wins
        tierOf.set(lexeme.id, tier);
        byId.set(lexeme.id, lexeme);
      }
    };

    assignTier(exactLemma, 0);
    assignTier(prefixLemma, 1);
    assignTier(formMatch, 2);
    assignTier(translationMatch.filter(isWholeWordTranslationMatch), 3);
    assignTier(translationMatch, 4); // remaining translation matches are substring-only

    const lexemes = [...byId.values()]
      .sort((a, b) => {
        const tierDiff = tierOf.get(a.id)! - tierOf.get(b.id)!;
        if (tierDiff !== 0) return tierDiff;
        return (a.frequencyRank ?? Infinity) - (b.frequencyRank ?? Infinity);
      })
      .slice(0, limit);

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
