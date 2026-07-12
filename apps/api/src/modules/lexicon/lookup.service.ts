import { Injectable } from '@nestjs/common';
import { foldForLookup } from '@wortgarten/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveContraction } from './contractions';
import { rankLexemes } from './ranking';
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

  /**
   * Fold the surface and return every dictionary entry it could be, ranked most-plausible first —
   * ambiguity is normal and never collapsed, but a caller taking the top candidate should get a
   * sensible one. A contraction ("im") resolves to its base preposition ("in") before lookup; it is
   * never collectable in its contracted form. `isSentenceStart` feeds the ranking's casing signal
   * (see `rankLexemes`) — capitalization at the start of a sentence carries no information.
   */
  async lookupForm(surface: string, language = 'de', isSentenceStart = false): Promise<LexemeMatch[]> {
    const effectiveSurface = resolveContraction(surface) ?? surface;
    const normalized = foldForLookup(effectiveSurface);
    const forms = await this.prisma.wordForm.findMany({
      where: { normalized, lexeme: { language } },
      include: { lexeme: { include: { senses: true } } },
    });

    const matches = forms.map(({ lexeme, ...form }) => ({
      lexeme,
      form,
      senses: lexeme.senses,
    }));

    return rankLexemes(matches, { surface: effectiveSurface, isSentenceStart });
  }

  /**
   * Resolves every token in a sentence. Reassembles German separable verbs:
   * if a token is a known separable prefix of a verb matched earlier in the
   * sentence (e.g. "an" after "rufe" → "anrufen"), both tokens collapse into
   * one match instead of two.
   *
   * `sentenceStartIndices` marks which token indices open a sentence, so the ranking's casing
   * signal can be suppressed there (a caller with real sentence boundaries — e.g. `AnalyzeService`,
   * which already splits them for `sourceSentence` — should pass this; omitted, only index 0 counts).
   */
  async lookupSentence(
    input: string | string[],
    language = 'de',
    sentenceStartIndices?: Set<number>,
  ): Promise<SentenceTokenMatch[]> {
    const tokens = Array.isArray(input) ? input : tokenize(input);
    const results: SentenceTokenMatch[] = [];
    const pendingVerbs: PendingSeparableVerb[] = [];

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const folded = foldForLookup(token);
      const isSentenceStart = sentenceStartIndices ? sentenceStartIndices.has(i) : i === 0;

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
        // An ambiguous bare-stem token (e.g. "rufe") can queue several candidate
        // separable verbs at once. Once ANY of them is resolved, that slot is
        // taken — drop the rest so a later, unrelated prefix token can't clobber
        // an already-resolved slot and orphan its first token.
        for (let j = pendingVerbs.length - 1; j >= 0; j--) {
          if (pendingVerbs[j].resultIndex === pending.resultIndex) pendingVerbs.splice(j, 1);
        }
        continue;
      }

      const matches = await this.lookupForm(token, language, isSentenceStart);
      const resultIndex = results.length;
      results.push({
        tokens: [token],
        tokenIndices: [i],
        matches,
        unknown: matches.length === 0,
      });

      // A bare stem that's ALSO a complete, self-contained plain verb (e.g.
      // "komme" is both "kommen" and a conjugated stem of "auskommen") should
      // resolve to that plain reading rather than gamble on a later token
      // happening to share some other verb's separable prefix — "Ich komme aus
      // London" is "kommen" + "aus" (from), not "auskommen" (to get by). Only
      // queue a separable-verb candidate when the stem has no plain escape hatch.
      const hasPlainVerbMatch = matches.some((m) => m.lexeme.partOfSpeech === 'VERB' && !m.lexeme.separablePrefix);
      if (!hasPlainVerbMatch) {
        for (const match of matches) {
          if (match.lexeme.partOfSpeech === 'VERB' && match.lexeme.separablePrefix) {
            pendingVerbs.push({ resultIndex, tokenIndex: i, match });
          }
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
