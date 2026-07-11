import { Injectable } from '@nestjs/common';
import { foldForLookup } from '@wortgarten/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { tokenize } from './tokenizer';
import type { LexemeMatch, SentenceTokenMatch } from './types';

interface PendingSeparableVerb {
  resultIndex: number;
  tokenIndex: number;
  match: LexemeMatch;
}

@Injectable()
export class LookupService {
  constructor(private readonly prisma: PrismaService) {}

  /** Fold the surface and return every dictionary entry it could be — ambiguity is normal, never guess a winner. */
  async lookupForm(surface: string, language = 'de'): Promise<LexemeMatch[]> {
    const normalized = foldForLookup(surface);
    const forms = await this.prisma.wordForm.findMany({
      where: { normalized, lexeme: { language } },
      include: { lexeme: { include: { senses: true } } },
    });

    return forms.map(({ lexeme, ...form }) => ({
      lexeme,
      form,
      senses: lexeme.senses,
    }));
  }

  /**
   * Resolves every token in a sentence. Reassembles German separable verbs:
   * if a token is a known separable prefix of a verb matched earlier in the
   * sentence (e.g. "an" after "rufe" → "anrufen"), both tokens collapse into
   * one match instead of two.
   */
  async lookupSentence(input: string | string[], language = 'de'): Promise<SentenceTokenMatch[]> {
    const tokens = Array.isArray(input) ? input : tokenize(input);
    const results: SentenceTokenMatch[] = [];
    const pendingVerbs: PendingSeparableVerb[] = [];

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const folded = foldForLookup(token);

      const pendingIndex = pendingVerbs.findIndex(
        (p) => p.match.lexeme.separablePrefix != null && foldForLookup(p.match.lexeme.separablePrefix) === folded,
      );

      if (pendingIndex !== -1) {
        const pending = pendingVerbs[pendingIndex];
        results[pending.resultIndex] = {
          tokens: [tokens[pending.tokenIndex], token],
          tokenIndices: [pending.tokenIndex, i],
          matches: [pending.match],
          unknown: false,
        };
        pendingVerbs.splice(pendingIndex, 1);
        continue;
      }

      const matches = await this.lookupForm(token, language);
      const resultIndex = results.length;
      results.push({
        tokens: [token],
        tokenIndices: [i],
        matches,
        unknown: matches.length === 0,
      });

      for (const match of matches) {
        if (match.lexeme.partOfSpeech === 'VERB' && match.lexeme.separablePrefix) {
          pendingVerbs.push({ resultIndex, tokenIndex: i, match });
        }
      }
    }

    return results;
  }

  /** Prefer a lexeme the user already has in their word bank; otherwise return all candidates for the UI to offer. */
  async disambiguate(matches: LexemeMatch[], userId: string): Promise<LexemeMatch[]> {
    if (matches.length <= 1) return matches;

    const senseIds = matches.flatMap((m) => m.senses.map((s) => s.id));
    const owned = await this.prisma.userWord.findMany({
      where: { userId, senseId: { in: senseIds } },
      select: { senseId: true },
    });
    const ownedSenseIds = new Set(owned.map((o) => o.senseId));
    const preferred = matches.filter((m) => m.senses.some((s) => ownedSenseIds.has(s.id)));

    return preferred.length > 0 ? preferred : matches;
  }
}
