import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import type { Lexeme, PartOfSpeech, Sense, UserWord } from '@wortgarten/database';
import { displayForm, isIncomplete, pluralDisplayForm, tokenize, type PlanItem } from '@wortgarten/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { localDateKey, localDayRange } from '../../streak/streak.service';
import { RUSTY_THRESHOLD, WordsService } from '../words/words.service';
import { SrsService } from '../srs/srs.service';

export const SESSION_MAX_TASKS = 10;
export const SESSION_MAX_NEW = 4;
const FUNCTION_WORD_FREQUENCY_RANK = 200;
const FREQUENCY_BAND = 300;
const DETERMINERS = ['der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer', 'eines'];
const MIN_SENTENCE_TOKENS = 4;
const MAX_SENTENCE_TOKENS = 10;
const SENTENCE_CANDIDATES = 5;

type UserWordWithLexeme = UserWord & { sense: Sense & { lexeme: Lexeme } };

export interface SessionPlanPreview {
  dueCount: number;
  newCount: number;
  total: number;
  words: UserWordWithLexeme[];
}

interface SentenceCandidateRow {
  id: string;
  text: string;
  translation: string;
  tokenCount: number;
  senseId: string | null;
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

@Injectable()
export class SessionBuilderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly srs: SrsService,
    private readonly words: WordsService,
  ) {}

  /** The main "10 tasks a day" composition: due-first by lowest retrievability, backfilled with NEW
   * words capped at SESSION_MAX_NEW. The cap is unconditional — it also applies when there are no
   * due words at all, so an all-NEW bank produces a short session (≤ SESSION_MAX_NEW), never a
   * padded one. Short sessions are correct; nothing ever pads past what these two rules produce. */
  async composePlan(userId: string, size = SESSION_MAX_TASKS, now: Date = new Date()): Promise<PlanItem[]> {
    const { reviewSlice, newSlice } = await this.selectWords(userId, size, now);
    const selected = this.interleave(reviewSlice, newSlice).slice(0, size);
    return this.buildPlanItems(userId, selected);
  }

  /** Same due-first + capped-NEW selection as composePlan, without building full PlanItems (no
   * distractor generation, no sentence lookup) — so a preview count can never disagree with the
   * real session, because it's the same selection code. */
  async planPreview(userId: string, size = SESSION_MAX_TASKS, now: Date = new Date()): Promise<SessionPlanPreview> {
    const { reviewSlice, newSlice } = await this.selectWords(userId, size, now);
    return {
      dueCount: reviewSlice.length,
      newCount: newSlice.length,
      total: reviewSlice.length + newSlice.length,
      words: this.interleave(reviewSlice, newSlice),
    };
  }

  private async selectWords(
    userId: string,
    size: number,
    now: Date,
  ): Promise<{ reviewSlice: UserWordWithLexeme[]; newSlice: UserWordWithLexeme[] }> {
    const [dueReviewed, newWords] = await Promise.all([
      this.prisma.userWord.findMany({
        where: { userId, dueAt: { lte: now }, reps: { gt: 0 } },
        include: { sense: { include: { lexeme: true } } },
      }),
      this.prisma.userWord.findMany({
        where: { userId, level: 'NEW' },
        include: { sense: { include: { lexeme: true } } },
        orderBy: { addedAt: 'asc' },
      }),
    ]);

    const reviewSorted = dueReviewed
      .map((userWord) => ({ userWord, retrievability: this.srs.retrievability(userWord, now) }))
      .sort((a, b) => a.retrievability - b.retrievability)
      .map((r) => r.userWord);

    const reviewSlice = reviewSorted.slice(0, size);
    const remaining = Math.max(0, size - reviewSlice.length);
    const newSlice = newWords.slice(0, Math.min(remaining, SESSION_MAX_NEW));

    return { reviewSlice, newSlice };
  }

  /** Word detail's "Practice now" / Progress's "Practice these 5" pin to an exact set of words —
   * no due-ness filter, since the user explicitly chose them. Unpinned (session summary's
   * "Practice N more") instead samples the practice pool: not due, not NEW, and not touched by
   * any attempt already made today — so chaining "Practice more" repeatedly can never loop back
   * to a word from an earlier round in the same day (only today's own selection recurses; the
   * exclusion is derived fresh from the Attempt table every call, not from a client-passed list,
   * so it can't go stale across a chain of practice sessions). Practice sessions still produce
   * real PlanItems; SessionGradingService is what skips FSRS for them (isPractice on the
   * DrillSession, not anything special about the plan itself). */
  async composePracticePlan(userId: string, size: number, userWordId?: string, userWordIds?: string[], now: Date = new Date()): Promise<PlanItem[]> {
    const pinnedIds = userWordIds && userWordIds.length > 0 ? userWordIds : userWordId ? [userWordId] : null;

    const words = pinnedIds
      ? await this.prisma.userWord.findMany({
          where: { userId, id: { in: pinnedIds } },
          include: { sense: { include: { lexeme: true } } },
        })
      : await this.prisma.userWord.findMany({
          where: { userId, level: { not: 'NEW' }, dueAt: { gt: now }, id: { notIn: await this.touchedTodayUserWordIds(userId, now) } },
          include: { sense: { include: { lexeme: true } } },
          take: size * 3, // headroom to sample from
        });

    const selected = pinnedIds ? words : shuffle(words).slice(0, size);
    return this.buildPlanItems(userId, selected as UserWordWithLexeme[]);
  }

  /** The real count "Practice N more" would offer — same pool filter as the unpinned branch of
   * composePracticePlan, so the count a user sees can never disagree with what pressing the
   * button actually starts. */
  async practicePoolPreview(userId: string, size = SESSION_MAX_TASKS, now: Date = new Date()): Promise<{ total: number }> {
    const total = await this.prisma.userWord.count({
      where: { userId, level: { not: 'NEW' }, dueAt: { gt: now }, id: { notIn: await this.touchedTodayUserWordIds(userId, now) } },
    });
    return { total: Math.min(total, size) };
  }

  /** Rescue: worst-retrievability-first, rusty words only, capped at `size` — the rest surface
   * next time rather than padding the session with non-rusty words. Reuses WordsService.findRusty
   * (same threshold, same sort) so the Home card's count and the actual rescue session can never
   * disagree. This is a real session — the caller keeps isPractice:false so grading feeds FSRS and
   * moves the ladder normally, same as composePlan. */
  async composeRescuePlan(userId: string, size = SESSION_MAX_TASKS, now: Date = new Date()): Promise<PlanItem[]> {
    const rusty = await this.words.findRusty(userId, RUSTY_THRESHOLD, now);
    const selected = rusty.slice(0, size).map((r) => r.userWord) as UserWordWithLexeme[];
    return this.buildPlanItems(userId, selected);
  }

  /** Every userWord with a non-retry attempt today, in the user's own timezone — the practice
   * pool's exclusion set. Derived fresh from Attempt every call (not passed in from the client),
   * so a chain of "Practice more" clicks can't resurface a word from an earlier round today: each
   * round's own attempts widen the exclusion for the next one automatically. */
  private async touchedTodayUserWordIds(userId: string, now: Date): Promise<string[]> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } });
    const todayKey = localDateKey(now, user.timezone);
    const { start } = localDayRange(todayKey, user.timezone);
    const attempts = await this.prisma.attempt.findMany({
      where: { isRetry: false, answeredAt: { gte: start }, userWord: { userId } },
      select: { userWordId: true },
      distinct: ['userWordId'],
    });
    return attempts.map((a) => a.userWordId);
  }

  /** Round-robin merge so NEW words aren't all clustered at the end. Distinct userWordIds throughout,
   * so "never the same word twice in a row" is satisfied by construction. */
  private interleave(a: UserWordWithLexeme[], b: UserWordWithLexeme[]): UserWordWithLexeme[] {
    const merged: UserWordWithLexeme[] = [];
    const max = Math.max(a.length, b.length);
    for (let i = 0; i < max; i++) {
      if (a[i]) merged.push(a[i]);
      if (b[i]) merged.push(b[i]);
    }
    return merged;
  }

  private async buildPlanItems(userId: string, words: UserWordWithLexeme[]): Promise<PlanItem[]> {
    const knownLexemeIds = await this.getKnownLexemeIds(userId);
    const items: PlanItem[] = [];
    for (const userWord of words) {
      items.push(await this.buildPlanItem(userId, userWord, knownLexemeIds));
    }
    return items;
  }

  private async getKnownLexemeIds(userId: string): Promise<string[]> {
    const [bank, functionWords] = await Promise.all([
      this.prisma.userWord.findMany({ where: { userId }, select: { sense: { select: { lexemeId: true } } } }),
      this.prisma.lexeme.findMany({ where: { language: 'de', frequencyRank: { lte: FUNCTION_WORD_FREQUENCY_RANK } }, select: { id: true } }),
    ]);
    return [...new Set([...bank.map((b) => b.sense.lexemeId), ...functionWords.map((f) => f.id)])];
  }

  private async decideTaskType(lexeme: Lexeme, level: UserWord['level']): Promise<'PICK_MEANING' | 'TYPE_WORD' | 'BUILD_SENTENCE'> {
    if (isIncomplete(lexeme)) return 'PICK_MEANING';

    if (level === 'NEW' || level === 'RECOGNIZE') return 'PICK_MEANING';
    if (level === 'RECALL') return 'TYPE_WORD';

    // PRODUCE or MASTERED — BUILD_SENTENCE unless there's no tileable sentence
    const hasTileable = await this.hasTileableSentence(lexeme.id);
    return hasTileable ? 'BUILD_SENTENCE' : 'TYPE_WORD';
  }

  private async hasTileableSentence(lexemeId: string): Promise<boolean> {
    const count = await this.prisma.exampleWord.count({
      where: {
        lexemeId,
        isUsableForTiles: true,
        example: { isWellFormed: true, tokenCount: { gte: MIN_SENTENCE_TOKENS, lte: MAX_SENTENCE_TOKENS } },
      },
    });
    return count > 0;
  }

  private async buildPlanItem(userId: string, userWord: UserWordWithLexeme, knownLexemeIds: string[]): Promise<PlanItem> {
    const lexeme = userWord.sense.lexeme;
    const taskType = await this.decideTaskType(lexeme, userWord.level);
    const base = {
      id: randomUUID(),
      userWordId: userWord.id,
      senseId: userWord.senseId,
      lexemeId: lexeme.id,
      isRetry: false,
      levelAtPlanTime: userWord.level,
    };

    if (taskType === 'PICK_MEANING') {
      const { payload, solution } = await this.buildPickMeaning(userId, userWord, lexeme);
      return { ...base, taskType: 'PICK_MEANING', payload, solution };
    }
    if (taskType === 'TYPE_WORD') {
      const { payload, solution } = this.buildTypeWord(userWord, lexeme);
      return { ...base, taskType: 'TYPE_WORD', payload, solution };
    }
    return this.buildBuildSentence(base, userWord, lexeme, knownLexemeIds);
  }

  // ─── PICK_MEANING ────────────────────────────────────────────────────────

  private async buildPickMeaning(userId: string, userWord: UserWordWithLexeme, lexeme: Lexeme) {
    const targetSense = userWord.sense;
    const correctLabel = userWord.customTranslation ?? targetSense.translation;
    const bandLow = (lexeme.frequencyRank ?? 3000) - FREQUENCY_BAND;
    const bandHigh = (lexeme.frequencyRank ?? 3000) + FREQUENCY_BAND;

    // Homographs: other Lexeme rows with the identical lemma spelling (this dictionary splits them
    // into separate Lexemes, not separate Senses on one — e.g. "die Bank" the bench vs "die Bank"
    // the financial institution). A sense of ANY of these must never be offered as a distractor for
    // the target — it would be a second correct answer on the same card, not a wrong one.
    const siblingLexemes = await this.prisma.lexeme.findMany({
      where: { language: lexeme.language, lemma: lexeme.lemma, id: { not: lexeme.id } },
    });
    const excludedLexemeIds = [lexeme.id, ...siblingLexemes.map((s) => s.id)];

    const bankCandidates = await this.prisma.userWord.findMany({
      where: { userId, senseId: { not: targetSense.id }, sense: { lexeme: { partOfSpeech: lexeme.partOfSpeech, id: { notIn: excludedLexemeIds } } } },
      include: { sense: true },
      take: 20,
    });

    const distractorSenses = new Map<string, Sense>();
    for (const c of shuffle(bankCandidates)) {
      if (distractorSenses.size >= 3) break;
      if (c.sense.translation === correctLabel) continue;
      if ([...distractorSenses.values()].some((sense) => sense.translation === c.sense.translation)) continue;
      distractorSenses.set(c.sense.id, c.sense);
    }

    if (distractorSenses.size < 3) {
      const generalCandidates = await this.prisma.sense.findMany({
        where: {
          id: { not: targetSense.id },
          lexeme: { language: lexeme.language, partOfSpeech: lexeme.partOfSpeech, id: { notIn: excludedLexemeIds }, frequencyRank: { gte: bandLow, lte: bandHigh } },
        },
        take: 20,
      });
      for (const s of shuffle(generalCandidates)) {
        if (distractorSenses.size >= 3) break;
        if (s.translation === correctLabel) continue;
        if ([...distractorSenses.values()].some((sense) => sense.translation === s.translation)) continue;
        distractorSenses.set(s.id, s);
      }
    }

    if (distractorSenses.size < 3) {
      // last resort: drop the frequency band, still same POS/different lexeme (incl. homograph siblings)
      const wideCandidates = await this.prisma.sense.findMany({
        where: { id: { not: targetSense.id }, lexeme: { language: lexeme.language, partOfSpeech: lexeme.partOfSpeech, id: { notIn: excludedLexemeIds } } },
        take: 20,
      });
      for (const s of shuffle(wideCandidates)) {
        if (distractorSenses.size >= 3) break;
        if (s.translation === correctLabel) continue;
        if ([...distractorSenses.values()].some((sense) => sense.translation === s.translation)) continue;
        distractorSenses.set(s.id, s);
      }
    }

    const attemptCount = await this.prisma.attempt.count({ where: { userWordId: userWord.id } });
    const isNew = userWord.level === 'NEW' && attemptCount === 0;

    const options = shuffle([
      { senseId: targetSense.id, label: correctLabel },
      ...[...distractorSenses.values()].map((s) => ({ senseId: s.id, label: s.translation })),
    ]);

    // The prompt itself is only ambiguous when a sibling lexeme would render an IDENTICAL display
    // string (same lemma AND same gender/article — "der See" vs "die See" already disambiguates via
    // the article alone) AND the user actually has that sibling in their bank (otherwise there's
    // nothing in this session to confuse it with). Only then does the bare prompt get a hint;
    // everything else keeps the plain, uncluttered "die Katze" style.
    const sameDisplaySiblingIds = siblingLexemes.filter((s) => s.gender === lexeme.gender).map((s) => s.id);
    const hasCollisionInBank =
      sameDisplaySiblingIds.length > 0 &&
      (await this.prisma.userWord.count({ where: { userId, sense: { lexeme: { id: { in: sameDisplaySiblingIds } } } } })) > 0;
    const plural = pluralDisplayForm(lexeme);
    const prompt = hasCollisionInBank && plural ? `${displayForm(lexeme)} (${plural})` : displayForm(lexeme);

    return {
      payload: { prompt, partOfSpeech: lexeme.partOfSpeech, options, isNew },
      solution: {
        correctSenseId: targetSense.id,
        correctLabel,
        lemma: lexeme.lemma,
        partOfSpeech: lexeme.partOfSpeech,
        gender: lexeme.gender,
      },
    };
  }

  // ─── TYPE_WORD ───────────────────────────────────────────────────────────

  private buildTypeWord(userWord: UserWordWithLexeme, lexeme: Lexeme) {
    const translation = userWord.customTranslation ?? userWord.sense.translation;
    return {
      payload: { prompt: translation, partOfSpeech: lexeme.partOfSpeech, requiresArticle: lexeme.partOfSpeech === 'NOUN' },
      solution: { lexemeId: lexeme.id, lemma: lexeme.lemma, partOfSpeech: lexeme.partOfSpeech, gender: lexeme.gender, translation },
    };
  }

  // ─── BUILD_SENTENCE ──────────────────────────────────────────────────────

  private async buildBuildSentence(
    base: { id: string; userWordId: string; senseId: string; lexemeId: string; isRetry: boolean; levelAtPlanTime: UserWord['level'] },
    userWord: UserWordWithLexeme,
    lexeme: Lexeme,
    knownLexemeIds: string[],
  ): Promise<PlanItem> {
    const candidates = await this.prisma.$queryRaw<SentenceCandidateRow[]>`
      SELECT e.id, e.text, e.translation, e."tokenCount", ew."senseId",
             COUNT(*) FILTER (WHERE ew2."lexemeId" = ANY(${knownLexemeIds})) AS known_overlap
      FROM "ExampleWord" ew
      JOIN "Example" e ON e.id = ew."exampleId"
      JOIN "ExampleWord" ew2 ON ew2."exampleId" = e.id AND ew2."lexemeId" <> ew."lexemeId"
      WHERE ew."lexemeId" = ${lexeme.id}
        AND ew."isUsableForTiles"
        AND e."isWellFormed"
        AND e."tokenCount" BETWEEN ${MIN_SENTENCE_TOKENS} AND ${MAX_SENTENCE_TOKENS}
      GROUP BY e.id, ew."senseId"
      ORDER BY (ew."senseId" IS NOT NULL AND ew."senseId" = ${userWord.senseId}) DESC, known_overlap DESC, e."tokenCount" ASC
      LIMIT ${SENTENCE_CANDIDATES}
    `;

    if (candidates.length === 0) {
      // Defensive fallback — hasTileableSentence used the same filters, so this should be rare/never.
      const { payload, solution } = this.buildTypeWord(userWord, lexeme);
      return { ...base, taskType: 'TYPE_WORD', payload, solution };
    }

    const chosen = pickRandom(candidates);
    const targetExampleWord = await this.prisma.exampleWord.findFirst({
      where: { exampleId: chosen.id, lexemeId: lexeme.id },
    });

    const correctTokens = tokenize(chosen.text);
    const distractors = await this.buildSentenceDistractors(chosen.id, correctTokens, lexeme, userWord.userId);

    const correctTileIds = correctTokens.map((_, i) => `c${i}`);
    const distractorTileIds = distractors.map((_, i) => `d${i}`);
    const tiles = shuffle([
      ...correctTokens.map((surface, i) => ({ id: correctTileIds[i], surface })),
      ...distractors.map((surface, i) => ({ id: distractorTileIds[i], surface })),
    ]);

    return {
      ...base,
      taskType: 'BUILD_SENTENCE',
      payload: { promptTranslation: chosen.translation, tiles, trailingPeriodPinned: true },
      solution: {
        correctTileOrder: correctTileIds,
        exampleId: chosen.id,
        sentenceText: chosen.text,
        lemma: lexeme.lemma,
        separablePrefix: lexeme.separablePrefix,
        prefixSurface: targetExampleWord?.prefixSurface ?? null,
      },
    };
  }

  /** Grammar distractors only — determiner, conjugation, case form. Antonyms are never used (there's
   * no antonym data in the schema to accidentally pull from), and same-POS-from-bank is the one
   * allowed fallback, only once fewer than 3 grammar distractors were found. */
  private async buildSentenceDistractors(
    exampleId: string,
    correctTokens: string[],
    targetLexeme: Lexeme,
    userId: string,
  ): Promise<string[]> {
    const distractors: string[] = [];
    const usedLower = new Set(correctTokens.map((t) => t.toLowerCase()));

    // 1. wrong determiner
    const determinerUsed = correctTokens.find((t) => DETERMINERS.includes(t.toLowerCase()));
    if (determinerUsed) {
      const pool = DETERMINERS.filter((d) => d !== determinerUsed.toLowerCase());
      distractors.push(pickRandom(pool));
    }

    if (distractors.length < 3) {
      const sentenceLexemes = await this.prisma.exampleWord.findMany({
        where: { exampleId },
        include: { lexeme: { include: { forms: true } } },
      });

      // 2. wrong conjugation of the sentence's own verb
      const verbRow = sentenceLexemes.find((r) => r.lexeme.partOfSpeech === 'VERB');
      if (verbRow) {
        const altForm = verbRow.lexeme.forms
          .map((f) => f.surface)
          .find((s) => !usedLower.has(s.toLowerCase()) && !distractors.includes(s));
        if (altForm) distractors.push(altForm);
      }
    }

    if (distractors.length < 3) {
      const sentenceLexemes = await this.prisma.exampleWord.findMany({
        where: { exampleId },
        include: { lexeme: { include: { forms: true } } },
      });

      // 3. wrong case form of a noun/pronoun in the sentence (never the target word itself)
      const nounRow = sentenceLexemes.find(
        (r) => (r.lexeme.partOfSpeech === 'NOUN' || r.lexeme.partOfSpeech === 'PRONOUN') && r.lexemeId !== targetLexeme.id,
      );
      if (nounRow) {
        const altForm = nounRow.lexeme.forms
          .map((f) => f.surface)
          .find((s) => !usedLower.has(s.toLowerCase()) && !distractors.includes(s));
        if (altForm) distractors.push(altForm);
      }
    }

    // 4. fallback: same-POS word from the user's bank
    if (distractors.length < 3) {
      const bankCandidates = await this.prisma.userWord.findMany({
        where: { userId, sense: { lexeme: { partOfSpeech: targetLexeme.partOfSpeech, id: { not: targetLexeme.id } } } },
        include: { sense: { include: { lexeme: true } } },
        take: 20,
      });
      for (const c of shuffle(bankCandidates)) {
        if (distractors.length >= 3) break;
        const surface = c.sense.lexeme.lemma;
        if (!usedLower.has(surface.toLowerCase()) && !distractors.includes(surface)) distractors.push(surface);
      }
    }

    return distractors.slice(0, 3);
  }
}

function displayFormFor(lexeme: Lexeme): string {
  if (lexeme.partOfSpeech === 'NOUN' && lexeme.gender) {
    const article = { MASCULINE: 'der', FEMININE: 'die', NEUTER: 'das' }[lexeme.gender];
    return `${article} ${lexeme.lemma}`;
  }
  return lexeme.lemma;
}
