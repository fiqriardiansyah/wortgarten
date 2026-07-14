import { Injectable } from '@nestjs/common';
import {
  clauseFinalTokenIndices,
  foldForLookup,
  isFiniteVerbForm,
  rankLexemes,
  resolveSeparableSentence,
  tokenize,
  tokenizeWithOffsets,
} from '@wortgarten/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveContraction } from './contractions';
import type { LexemeMatch, SentenceTokenMatch } from './types';

type SeparableLexemeMatch = LexemeMatch & { isFiniteForm: boolean };

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
   * Resolves every token in a sentence. Reassembles German separable verbs: a finite base-verb
   * match (e.g. "rufe" matching "anrufen") merges with a later, clause-final token that folds to
   * its separable prefix ("an" in "Ich rufe dich an.") into one slot — see
   * `resolveSeparableSentence` (`@wortgarten/shared`) for the algorithm and the clause-final guard
   * that keeps "Ich denke an dich." (mid-clause "an", a plain preposition) from merging.
   *
   * `sentenceStartIndices` marks which token indices open a sentence, so the ranking's casing
   * signal can be suppressed there (a caller with real sentence boundaries — e.g. `AnalyzeService`,
   * which already splits them for `sourceSentence` — should pass this; omitted, only index 0 counts).
   *
   * `clauseFinalIndices` gates the separable-verb merge on clause position — pass it whenever the
   * caller has the original text/offsets (`AnalyzeService` does). Given a plain string `input`,
   * this method computes it directly. Given a pre-tokenized array with no positional information
   * and no explicit `clauseFinalIndices`, the merge runs unguarded (legacy behavior).
   */
  async lookupSentence(
    input: string | string[],
    language = 'de',
    sentenceStartIndices?: Set<number>,
    clauseFinalIndices?: Set<number>,
  ): Promise<SentenceTokenMatch[]> {
    let tokens: string[];
    let effectiveClauseFinal = clauseFinalIndices;
    if (Array.isArray(input)) {
      tokens = input;
    } else {
      tokens = tokenize(input);
      if (!effectiveClauseFinal) effectiveClauseFinal = clauseFinalTokenIndices(input, tokenizeWithOffsets(input));
    }

    const resolve = async (token: string, index: number): Promise<SeparableLexemeMatch[]> => {
      const isSentenceStart = sentenceStartIndices ? sentenceStartIndices.has(index) : index === 0;
      const matches = await this.lookupForm(token, language, isSentenceStart);
      return matches.map((m) => ({ ...m, isFiniteForm: isFiniteVerbForm((m.form.features as { raw?: string[] } | null)?.raw) }));
    };

    const slots = await resolveSeparableSentence(tokens, resolve, effectiveClauseFinal);
    return slots.map((s) => ({ tokens: s.tokens, tokenIndices: s.tokenIndices, matches: s.matches, unknown: s.unknown }));
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
