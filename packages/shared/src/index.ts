import { z } from 'zod';
import { StatsByModeSchema } from './session-types';

export * from './text';
export * from './contractions';
export * from './lexeme';
export * from './tokenizer';
export * from './ranking';
export * from './separable';
export * from './session-types';
export * from './grading';
export * from './story';
export * from './ai';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const WordLevelSchema = z.enum(['new', 'learning', 'mastered']);
export type WordLevel = z.infer<typeof WordLevelSchema>;

// Ladder-level as stored on UserWord — distinct from WordLevelSchema above, which is
// the 3-bucket shape the Home dashboard contract collapses it to.
export const LadderLevelSchema = z.enum(['NEW', 'RECOGNIZE', 'RECALL', 'PRODUCE', 'MASTERED']);

// ─── Domain entities ──────────────────────────────────────────────────────────

export const WordSummarySchema = z.object({
  id: z.string().optional(),
  german: z.string(),
  native: z.string(),
  level: WordLevelSchema,
  isRusty: z.boolean(),
});
export type WordSummary = z.infer<typeof WordSummarySchema>;

export const SessionSummarySchema = z.object({
  wordCount: z.number(), // total tasks when starting a fresh session; tasks left when isActive
  estMinutes: z.number(),
  taskBreakdown: z.object({
    flashcards: z.number(),
    recalls: z.number(),
    sentenceBuilds: z.number(),
  }),
  previewWords: z.array(z.string()),
  isActive: z.boolean(), // an ACTIVE DrillSession already exists — CTA is "Resume", not "Start"
});
export type SessionSummary = z.infer<typeof SessionSummarySchema>;

export const RustyGroupSchema = z.object({
  count: z.number(),
  wordsPreview: z.array(z.string()),
  extraCount: z.number(),
});
export type RustyGroup = z.infer<typeof RustyGroupSchema>;

// Home's one story card, discriminated by which of the 3 real states applies — never a single
// shape with zeroed-out fields (the "0% your words" bug class). Exactly one variant is ever true:
// a READY unread story, a pending generation, or too few known words to generate one yet.
export const HomeStoryCardSchema = z.discriminatedUnion('state', [
  z.object({
    state: z.literal('ready'),
    id: z.string(),
    title: z.string(),
    estMinutes: z.number(),
    // Gates the "100% your words" badge — mirrors Story.coverageKnownPct === 100 exactly
    // (see packages/shared/src/story.ts). Never render a badge for a lower percentage.
    isFullyKnown: z.boolean(),
    isNewToday: z.boolean(),
  }),
  z.object({ state: z.literal('generating') }),
  z.object({ state: z.literal('locked'), wordsToGo: z.number() }),
]);
export type HomeStoryCard = z.infer<typeof HomeStoryCardSchema>;

export const QuestSchema = z.object({
  label: z.string(),
  current: z.number(),
  target: z.number(),
  rewardLabel: z.string(),
});
export type Quest = z.infer<typeof QuestSchema>;

export const GardenStatsSchema = z.object({
  collected: z.number(),
  mastered: z.number(),
  segments: z.object({
    new: z.number(),
    learning: z.number(),
    mastered: z.number(),
  }),
});
export type GardenStats = z.infer<typeof GardenStatsSchema>;

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const SessionUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  image: z.string().nullish(),
});
export type SessionUser = z.infer<typeof SessionUserSchema>;

export const MeResponseSchema = z.object({
  user: SessionUserSchema,
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

// ─── Lexicon ──────────────────────────────────────────────────────────────────

export const PartOfSpeechSchema = z.enum([
  'NOUN',
  'VERB',
  'ADJECTIVE',
  'ADVERB',
  'PRONOUN',
  'PREPOSITION',
  'CONJUNCTION',
  'ARTICLE',
  'NUMERAL',
  'PARTICLE',
  'OTHER',
]);

export const GenderSchema = z.enum(['MASCULINE', 'FEMININE', 'NEUTER']);

export const LexemeSummarySchema = z.object({
  id: z.string(),
  lemma: z.string(),
  partOfSpeech: PartOfSpeechSchema,
  gender: GenderSchema.nullable(),
  plural: z.string().nullable(),
  separablePrefix: z.string().nullable(),
  auxiliary: z.string().nullable().optional(),
  government: z.string().nullable().optional(),
  frequencyRank: z.number().nullable().optional(),
});
export type LexemeSummary = z.infer<typeof LexemeSummarySchema>;

export const SenseSummarySchema = z.object({
  id: z.string(),
  translation: z.string(),
  definition: z.string().nullable().optional(),
  example: z.string().nullable().optional(),
  cefrLevel: z.string().nullable().optional(),
});
export type SenseSummary = z.infer<typeof SenseSummarySchema>;

export const LexiconSearchResultSchema = z.object({
  lexeme: LexemeSummarySchema,
  senses: z.array(SenseSummarySchema.extend({ inBank: z.boolean() })),
});
export type LexiconSearchResult = z.infer<typeof LexiconSearchResultSchema>;

export const LexiconSearchResponseSchema = z.object({
  results: z.array(LexiconSearchResultSchema),
});
export type LexiconSearchResponse = z.infer<typeof LexiconSearchResponseSchema>;

export const AnalyzedSenseCandidateSchema = z.object({
  senseId: z.string(),
  translation: z.string(),
  lexeme: LexemeSummarySchema,
});
export type AnalyzedSenseCandidate = z.infer<typeof AnalyzedSenseCandidateSchema>;

export const AnalyzedTokenStatusSchema = z.enum(['KNOWN', 'NEW', 'AMBIGUOUS', 'UNRECOGNIZED']);
export type AnalyzedTokenStatus = z.infer<typeof AnalyzedTokenStatusSchema>;

export const AnalyzedTokenSchema = z.object({
  status: AnalyzedTokenStatusSchema,
  surface: z.string(),
  start: z.number(),
  end: z.number(),
  // Tokens sharing a groupId are one collectable unit (a reassembled separable
  // verb spans two tokens, e.g. "rufe" ... "an") — select/submit them together.
  groupId: z.number(),
  sourceSentence: z.string().optional(),
  candidates: z.array(AnalyzedSenseCandidateSchema).optional(),
  knownSenseId: z.string().optional(),
});
export type AnalyzedToken = z.infer<typeof AnalyzedTokenSchema>;

export const AnalyzeRequestSchema = z.object({
  text: z.string().min(1).max(5000),
});
export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;

export const AnalyzeResponseSchema = z.object({
  text: z.string(),
  tokens: z.array(AnalyzedTokenSchema),
  summary: z.object({
    total: z.number(),
    known: z.number(),
    new: z.number(),
    ambiguous: z.number(),
    unrecognized: z.number(),
  }),
});
export type AnalyzeResponse = z.infer<typeof AnalyzeResponseSchema>;

// ─── Word bank ────────────────────────────────────────────────────────────────

export const AddWordSourceTypeSchema = z.enum(['search', 'paste', 'manual', 'read']);
export type AddWordSourceType = z.infer<typeof AddWordSourceTypeSchema>;

export const AddWordRequestSchema = z.object({
  senseId: z.string(),
  sourceSentence: z.string().optional(),
  sourceType: AddWordSourceTypeSchema.optional(),
  customTranslation: z.string().optional(),
  note: z.string().optional(),
});
export type AddWordRequest = z.infer<typeof AddWordRequestSchema>;

export const AddWordResponseSchema = z.object({
  id: z.string(),
  created: z.boolean(),
});
export type AddWordResponse = z.infer<typeof AddWordResponseSchema>;

export const AddWordsBatchRequestSchema = z.object({
  items: z
    .array(
      z.object({
        senseId: z.string(),
        sourceSentence: z.string().optional(),
      }),
    )
    .min(1),
  sourceType: AddWordSourceTypeSchema.optional(),
});
export type AddWordsBatchRequest = z.infer<typeof AddWordsBatchRequestSchema>;

export const AddWordsBatchResponseSchema = z.object({
  added: z.array(z.object({ id: z.string(), senseId: z.string() })),
});
export type AddWordsBatchResponse = z.infer<typeof AddWordsBatchResponseSchema>;

export const WordFilterSchema = z.enum(['all', 'needs_attention', 'learning', 'mastered', 'new', 'incomplete']);
export type WordFilter = z.infer<typeof WordFilterSchema>;

export const WordCardSchema = z.object({
  id: z.string(),
  lexeme: LexemeSummarySchema,
  translation: z.string(),
  level: LadderLevelSchema,
  retrievability: z.number(),
  isRusty: z.boolean(),
  isIncomplete: z.boolean(),
  dueAt: z.string(),
  addedAt: z.string(),
});
export type WordCard = z.infer<typeof WordCardSchema>;

export const WordsListResponseSchema = z.object({
  items: z.array(WordCardSchema),
  total: z.number(),
});
export type WordsListResponse = z.infer<typeof WordsListResponseSchema>;

export const WordDetailSchema = z.object({
  id: z.string(),
  lexeme: LexemeSummarySchema,
  senses: z.array(SenseSummarySchema),
  activeSenseId: z.string(),
  translation: z.string(),
  example: z.string().nullable().optional(),
  sourceSentence: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  level: LadderLevelSchema,
  retrievability: z.number(),
  isRusty: z.boolean(),
  isIncomplete: z.boolean(),
  addedAt: z.string(),
  dueAt: z.string(),
  statsByMode: StatsByModeSchema,
});
export type WordDetail = z.infer<typeof WordDetailSchema>;

export const UpdateWordRequestSchema = z
  .object({
    customTranslation: z.string().nullable().optional(),
    note: z.string().nullable().optional(),
  })
  .refine((d) => d.customTranslation !== undefined || d.note !== undefined, {
    message: 'at least one field required',
  });
export type UpdateWordRequest = z.infer<typeof UpdateWordRequestSchema>;

// ─── Home dashboard ───────────────────────────────────────────────────────────

export const StreakSchema = z.object({
  current: z.number().int().nonnegative(),
  longest: z.number().int().nonnegative(),
  freezesBanked: z.number().int().min(0).max(2),
  learnedToday: z.boolean(),
  freezeSavedYesterday: z.boolean(),
});
export type Streak = z.infer<typeof StreakSchema>;

export const HomeDashboardSchema = z.object({
  greeting: z.string(),
  daySubtitle: z.string(),
  streak: StreakSchema,
  session: SessionSummarySchema,
  rusty: RustyGroupSchema,
  quest: QuestSchema,
  garden: GardenStatsSchema,
  story: HomeStoryCardSchema,
  recentlyAdded: z.array(WordSummarySchema),
  user: z.object({
    name: z.string(),
    tagline: z.string(),
  }),
});
export type HomeDashboard = z.infer<typeof HomeDashboardSchema>;

// ─── Progress dashboard ────────────────────────────────────────────────────

export const StreakDayStateSchema = z.enum(['completed', 'frozen', 'muted']);
export type StreakDayState = z.infer<typeof StreakDayStateSchema>;

export const StreakDaySchema = z.object({
  date: z.string(), // yyyy-MM-dd, user-local
  state: StreakDayStateSchema,
});
export type StreakDay = z.infer<typeof StreakDaySchema>;

export const ProgressStreakSchema = StreakSchema.extend({
  totalLearningDays: z.number().int().nonnegative(),
  calendar: z.array(StreakDaySchema),
});
export type ProgressStreak = z.infer<typeof ProgressStreakSchema>;

export const StreakWeekDayStateSchema = z.enum(['learned', 'frozen', 'today', 'future', 'missed']);
export type StreakWeekDayState = z.infer<typeof StreakWeekDayStateSchema>;

export const StreakWeekDaySchema = z.object({
  label: z.enum(['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']),
  state: StreakWeekDayStateSchema,
  isToday: z.boolean(),
  isLearned: z.boolean(),
});
export type StreakWeekDay = z.infer<typeof StreakWeekDaySchema>;

export const StreakWeekSchema = z.object({
  todayLabel: z.string(),
  currentStreak: z.number().int().nonnegative(),
  freezesLeft: z.number().int().min(0).max(2),
  days: z.array(StreakWeekDaySchema).length(7),
  freezeSpentThisWeek: z
    .object({
      dayLabel: z.string(),
    })
    .nullable()
    .optional(),
});
export type StreakWeek = z.infer<typeof StreakWeekSchema>;

export const MilestoneStatusSchema = z.enum(['done', 'current', 'locked']);
export type MilestoneStatus = z.infer<typeof MilestoneStatusSchema>;

export const ProblemWordSchema = z.object({
  userWordId: z.string(),
  displayForm: z.string(), // "der Hund", or bare lemma for non-nouns
  translation: z.string(),
  misses: z.number().int().positive(),
});
export type ProblemWord = z.infer<typeof ProblemWordSchema>;

export const GrowthBarSchema = z.object({
  label: z.string(), // e.g. "Jul 10"
  count: z.number().int().nonnegative(),
});
export type GrowthBar = z.infer<typeof GrowthBarSchema>;

export const GrowthSchema = z.object({
  windowDays: z.number().int().positive(),
  totalInWindow: z.number().int().nonnegative(),
  bars: z.array(GrowthBarSchema),
});
export type Growth = z.infer<typeof GrowthSchema>;

export const ProgressDashboardSchema = z.object({
  daySubtitle: z.string(), // "Day N of learning German" — account age, timezone-aware
  garden: GardenStatsSchema,
  streak: ProgressStreakSchema,
  // Optional during rolling deploys so a newer web client can still render an older API response.
  streakWeek: StreakWeekSchema.optional(),
  problemWords: z.array(ProblemWordSchema),
  growth: GrowthSchema,
});
export type ProgressDashboard = z.infer<typeof ProgressDashboardSchema>;
