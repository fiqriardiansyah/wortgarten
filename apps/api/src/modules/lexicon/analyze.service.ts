import { Injectable } from '@nestjs/common';
import { normalizeInput } from '@wortgarten/shared';
import type { Lexeme, Sense } from '@wortgarten/database';
import type { AnalyzedSenseCandidate, AnalyzedToken, AnalyzeResponse } from '@wortgarten/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { toLexemeSummary } from './lexeme-summary';
import type { LexemeMatch, SentenceTokenMatch } from './types';
import { LookupService } from './lookup.service';
import { tokenizeWithOffsets, type TokenSpan } from './tokenizer';

interface SentenceSpan {
  text: string;
  start: number;
  end: number;
}

// Splits on sentence-ending punctuation, keeping it attached to the sentence before it.
// A plain heuristic, not NLP — good enough to caption "which sentence did I meet this word in".
function splitSentences(text: string): SentenceSpan[] {
  const sentences: SentenceSpan[] = [];
  const pattern = /[^.!?]+[.!?]*/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const trimmed = match[0].trim();
    if (!trimmed) continue;
    sentences.push({ text: trimmed, start: match.index, end: match.index + match[0].length });
  }
  return sentences;
}

interface LexemeBucket {
  lexeme: Lexeme;
  senses: Sense[];
}

/** Groups a slot's matches by lexeme, deduping senses (multiple WordForm rows — e.g. two
 * declension-table entries for the same case — can repeat a lexeme and its senses). `matches` comes
 * from `LookupService`, already ranked most-plausible first (see `rankLexemes`); a Map preserves
 * insertion order, so the returned buckets inherit that order for free — callers must not re-sort. */
function bucketByLexeme(matches: LexemeMatch[]): LexemeBucket[] {
  const byId = new Map<string, LexemeBucket>();
  for (const m of matches) {
    let bucket = byId.get(m.lexeme.id);
    if (!bucket) {
      bucket = { lexeme: m.lexeme, senses: [] };
      byId.set(m.lexeme.id, bucket);
    }
    const seen = new Set(bucket.senses.map((s) => s.id));
    for (const sense of m.senses) {
      if (seen.has(sense.id)) continue;
      seen.add(sense.id);
      bucket.senses.push(sense);
    }
  }
  return [...byId.values()];
}

function toCandidates(bucket: LexemeBucket): AnalyzedSenseCandidate[] {
  return bucket.senses.map((s) => ({ senseId: s.id, translation: s.translation, lexeme: toLexemeSummary(bucket.lexeme) }));
}

interface Classification {
  status: AnalyzedToken['status'];
  candidates: AnalyzedSenseCandidate[];
  knownSenseId?: string;
}

/**
 * Decides NEW vs AMBIGUOUS vs KNOWN vs UNRECOGNIZED for one slot.
 *
 * Multiple senses on their own are NOT ambiguity — the seed caps senses at 5,
 * so most common words have several, and that's ordinary polysemy ("aus" =
 * out of / from / off). Real ambiguity is the surface resolving to genuinely
 * different lexemes: different gender ("der See" vs "die See"), or different
 * grammatical identity (a pronoun's "sie" vs a noun homograph). We flag it
 * when more than one matched lexeme shares the same part of speech — same-POS
 * homographs are a real fork the ordinary-polysemy case never produces, since
 * a word's own sense list is always one POS by construction.
 *
 * Within a single dominant lexeme, only NOUNs get the extra "is this actually
 * two different things wearing one dictionary entry" check (Bank the bench vs
 * Bank the financial institution) — nouns denote distinct real-world referents
 * when they fork, whereas this seed's verb/adjective/preposition sense lists
 * are reliably nuanced shades of one idea (kommen: to come / to arrive / to
 * come to / to get by...). A cheap, deliberately imperfect proxy, not NLP.
 *
 * Even when flagged AMBIGUOUS, this never blocks: candidates[0] is always a
 * sensible default (the top-ranked lexeme's first-listed sense — see
 * `rankLexemes`; `lexemeBuckets` is already in that order, inherited from
 * `slot.matches`) so the token is immediately collectable — "change meaning"
 * is an opt-in affordance.
 */
function classifySlot(slot: SentenceTokenMatch, ownedSenseIds: Set<string>): Classification {
  // A separable-prefix verb match only means something once actually merged
  // with its prefix (a 2-token slot). For a standalone stem it's just noise
  // from some unrelated compound verb sharing the same conjugated bare stem
  // (e.g. "komme" is the bare present-tense stem of ~50 different "-kommen"
  // verbs) — drop those so they don't manufacture false ambiguity.
  const matches =
    slot.tokens.length === 1
      ? slot.matches.filter((m) => !(m.lexeme.partOfSpeech === 'VERB' && m.lexeme.separablePrefix))
      : slot.matches;

  const lexemeBuckets = bucketByLexeme(matches);
  if (lexemeBuckets.length === 0) return { status: 'UNRECOGNIZED', candidates: [] };

  const knownSenseId = lexemeBuckets.flatMap((b) => b.senses).find((s) => ownedSenseIds.has(s.id))?.id;
  if (knownSenseId) return { status: 'KNOWN', candidates: [], knownSenseId };

  const byPos = new Map<string, LexemeBucket[]>();
  for (const bucket of lexemeBuckets) {
    const list = byPos.get(bucket.lexeme.partOfSpeech) ?? [];
    list.push(bucket);
    byPos.set(bucket.lexeme.partOfSpeech, list);
  }
  const crossLexemeAmbiguous = [...byPos.values()].some((list) => list.length > 1);

  if (crossLexemeAmbiguous) {
    return { status: 'AMBIGUOUS', candidates: lexemeBuckets.flatMap(toCandidates) };
  }

  const dominant = lexemeBuckets[0];
  if (dominant.lexeme.partOfSpeech === 'NOUN' && dominant.senses.length > 1) {
    return { status: 'AMBIGUOUS', candidates: toCandidates(dominant) };
  }
  return { status: 'NEW', candidates: toCandidates(dominant) };
}

@Injectable()
export class AnalyzeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: LookupService,
  ) {}

  async analyze(text: string, userId: string, language = 'de'): Promise<AnalyzeResponse> {
    const normalized = normalizeInput(text);
    const spans = tokenizeWithOffsets(normalized);
    const tokens = spans.map((s) => s.token);
    const sentences = splitSentences(normalized);

    // First token of each sentence — not just index 0 — so the ranking's casing signal is
    // correctly suppressed at the start of every sentence in a multi-sentence paste, not only the first.
    const sentenceStartIndices = new Set<number>();
    for (const sentence of sentences) {
      const firstIndex = spans.findIndex((s) => s.start >= sentence.start && s.start < sentence.end);
      if (firstIndex !== -1) sentenceStartIndices.add(firstIndex);
    }

    const slots = await this.lookup.lookupSentence(tokens, language, sentenceStartIndices);

    const allSenseIds = new Set<string>();
    for (const slot of slots) {
      for (const lexemeMatch of slot.matches) {
        for (const sense of lexemeMatch.senses) allSenseIds.add(sense.id);
      }
    }
    const owned = await this.prisma.userWord.findMany({
      where: { userId, senseId: { in: [...allSenseIds] } },
      select: { senseId: true },
    });
    const ownedSenseIds = new Set(owned.map((o) => o.senseId));

    const sourceSentenceAt = (start: number): string | undefined =>
      sentences.find((s) => start >= s.start && start < s.end)?.text;

    // One entry per ORIGINAL token (not per slot) so spans never overlap — a
    // filler word sitting between a separable verb's two tokens (e.g. "dich" in
    // "rufe dich an") gets its own span; tokens sharing a groupId are one unit.
    const tokenIndexToSlot = new Map<number, SentenceTokenMatch>();
    for (const slot of slots) {
      for (const tokenIndex of slot.tokenIndices) tokenIndexToSlot.set(tokenIndex, slot);
    }

    const classified = new Map<SentenceTokenMatch, Classification>();
    for (const slot of slots) {
      if (!classified.has(slot)) classified.set(slot, classifySlot(slot, ownedSenseIds));
    }

    const resultTokens: AnalyzedToken[] = spans.map((span: TokenSpan, tokenIndex) => {
      const slot = tokenIndexToSlot.get(tokenIndex)!;
      const { status, candidates, knownSenseId } = classified.get(slot)!;
      const groupId = Math.min(...slot.tokenIndices);
      const surface = normalized.slice(span.start, span.end);

      if (status === 'UNRECOGNIZED') {
        return { status, surface, start: span.start, end: span.end, groupId };
      }
      if (status === 'KNOWN') {
        return { status, surface, start: span.start, end: span.end, groupId, knownSenseId };
      }
      return {
        status,
        surface,
        start: span.start,
        end: span.end,
        groupId,
        candidates,
        sourceSentence: sourceSentenceAt(span.start),
      };
    });

    // Derived from the final token array, deduped by groupId, so the summary
    // can never disagree with what's actually rendered — a merged separable
    // verb (two tokens, one groupId) counts as one word throughout.
    const seenGroups = new Set<number>();
    const summary = { total: 0, known: 0, new: 0, ambiguous: 0, unrecognized: 0 };
    for (const token of resultTokens) {
      if (seenGroups.has(token.groupId)) continue;
      seenGroups.add(token.groupId);
      summary.total++;
      if (token.status === 'KNOWN') summary.known++;
      else if (token.status === 'NEW') summary.new++;
      else if (token.status === 'AMBIGUOUS') summary.ambiguous++;
      else summary.unrecognized++;
    }

    return { text: normalized, tokens: resultTokens, summary };
  }
}
