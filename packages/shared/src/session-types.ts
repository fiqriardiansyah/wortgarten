import { z } from 'zod';

// Local copies matching `PartOfSpeech`/`Gender` in ./lexeme — the same duplication pattern
// index.ts already uses (a zod enum can't be derived from a plain TS union type).
const PartOfSpeechSchema = z.enum([
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
const GenderSchema = z.enum(['MASCULINE', 'FEMININE', 'NEUTER']);
const WordLevelValueSchema = z.enum(['NEW', 'RECOGNIZE', 'RECALL', 'PRODUCE', 'MASTERED']);

// ─── Enums ────────────────────────────────────────────────────────────────────

export const AttemptResultSchema = z.enum([
  'CORRECT',
  'CORRECT_WITH_TYPO',
  'MISSING_UMLAUT',
  'MISSING_ARTICLE',
  'WRONG_GENDER',
  'WRONG_MEANING',
  'WRONG_FORM',
  'EMPTY',
]);
export type AttemptResult = z.infer<typeof AttemptResultSchema>;

export const DrillTaskTypeSchema = z.enum(['PICK_MEANING', 'TYPE_WORD', 'BUILD_SENTENCE']);
export type DrillTaskType = z.infer<typeof DrillTaskTypeSchema>;

export const DRILL_TASK_TYPES = DrillTaskTypeSchema.options;

export const TASK_TYPE_LABELS = {
  PICK_MEANING: 'Recognizing',
  TYPE_WORD: 'Recalling',
  BUILD_SENTENCE: 'Using in a sentence',
} satisfies Record<DrillTaskType, string>;

export const TASK_TYPE_ICONS = {
  PICK_MEANING: '👁',
  TYPE_WORD: '⌨',
  BUILD_SENTENCE: '🧩',
} satisfies Record<DrillTaskType, string>;

export const ATTEMPT_RESULT_LABELS = {
  CORRECT: '✓',
  CORRECT_WITH_TYPO: '✓',
  MISSING_UMLAUT: '✕',
  MISSING_ARTICLE: '✕',
  WRONG_GENDER: '✕',
  WRONG_MEANING: '✕',
  WRONG_FORM: '✕',
  EMPTY: '✕',
} satisfies Record<AttemptResult, string>;

/** Semantic alias for consumers that treat the display label as an icon. */
export const ATTEMPT_RESULT_SYMBOLS = ATTEMPT_RESULT_LABELS;

export function resultIsCorrect(result: AttemptResult): boolean {
  return result === 'CORRECT' || result === 'CORRECT_WITH_TYPO';
}

const ModeStatSchema = z.object({
  total: z.number().int().nonnegative(),
  correct: z.number().int().nonnegative(),
});

/** Display-only aggregate cache. Every key is optional because new and partially-practiced words are common. */
export const StatsByModeSchema = z.object({
  PICK_MEANING: ModeStatSchema.optional(),
  TYPE_WORD: ModeStatSchema.optional(),
  BUILD_SENTENCE: ModeStatSchema.optional(),
});
export type StatsByMode = z.infer<typeof StatsByModeSchema>;

export const DrillSessionStatusSchema = z.enum(['ACTIVE', 'COMPLETED', 'ABANDONED']);
export type DrillSessionStatusValue = z.infer<typeof DrillSessionStatusSchema>;

// ─── Task payloads (client-safe — no solution) ────────────────────────────────

/** The option identity is the dictionary sense. `label` is display-only and must never be graded.
 * The preprocess keeps already-frozen active plans from before the field rename resumable. */
export const PickMeaningOptionSchema = z.preprocess((value) => {
  if (value && typeof value === 'object' && 'id' in value && 'translation' in value) {
    const legacy = value as { id: unknown; translation: unknown };
    return { senseId: legacy.id, label: legacy.translation };
  }
  return value;
}, z.object({ senseId: z.string(), label: z.string() }));

export const PickMeaningPayloadSchema = z.object({
  prompt: z.string(), // displayForm, e.g. "die Katze"
  partOfSpeech: PartOfSpeechSchema,
  options: z.array(PickMeaningOptionSchema).length(4),
  isNew: z.boolean(),
});
export type PickMeaningPayload = z.infer<typeof PickMeaningPayloadSchema>;

export const TypeWordPayloadSchema = z.object({
  prompt: z.string(), // English translation
  partOfSpeech: PartOfSpeechSchema,
  requiresArticle: z.boolean(),
});
export type TypeWordPayload = z.infer<typeof TypeWordPayloadSchema>;

export const SentenceTileSchema = z.object({ id: z.string(), surface: z.string() });

export const BuildSentencePayloadSchema = z.object({
  promptTranslation: z.string(),
  tiles: z.array(SentenceTileSchema),
  trailingPeriodPinned: z.literal(true),
});
export type BuildSentencePayload = z.infer<typeof BuildSentencePayloadSchema>;

// ─── Solutions (server-only — never serialized to the client) ────────────────

export const PickMeaningSolutionSchema = z.preprocess((value) => {
  if (value && typeof value === 'object' && 'correctOptionId' in value && 'translation' in value) {
    const legacy = value as Record<string, unknown>;
    return { ...legacy, correctSenseId: legacy.correctOptionId, correctLabel: legacy.translation };
  }
  return value;
}, z.object({
  correctSenseId: z.string(),
  correctLabel: z.string(),
  lemma: z.string(),
  partOfSpeech: PartOfSpeechSchema,
  gender: GenderSchema.nullable(),
}));
export type PickMeaningSolution = z.infer<typeof PickMeaningSolutionSchema>;

export const TypeWordSolutionSchema = z.object({
  lexemeId: z.string(),
  lemma: z.string(),
  partOfSpeech: PartOfSpeechSchema,
  gender: GenderSchema.nullable(),
  translation: z.string(),
});
export type TypeWordSolution = z.infer<typeof TypeWordSolutionSchema>;

export const BuildSentenceSolutionSchema = z.object({
  correctTileOrder: z.array(z.string()), // tile ids, excluding the pinned trailing period
  exampleId: z.string(),
  sentenceText: z.string(),
  lemma: z.string(),
  separablePrefix: z.string().nullable(),
  prefixSurface: z.string().nullable(),
});
export type BuildSentenceSolution = z.infer<typeof BuildSentenceSolutionSchema>;

// ─── PlanItem — the frozen, server-only unit of DrillSession.plan ────────────

const PlanItemBaseSchema = z.object({
  id: z.string(), // planItemId — the idempotency key
  userWordId: z.string(),
  senseId: z.string(),
  lexemeId: z.string(),
  isRetry: z.boolean(),
  // The word's ladder level when this item was planned — compared against its CURRENT level at
  // /complete to detect a level-up, with no denormalized progress counter (same reasoning as the
  // MASTERED gate: this repo derives progress from data it already has, not a running total).
  levelAtPlanTime: WordLevelValueSchema,
});

export const PlanItemSchema = z.discriminatedUnion('taskType', [
  PlanItemBaseSchema.extend({
    taskType: z.literal('PICK_MEANING'),
    payload: PickMeaningPayloadSchema,
    solution: PickMeaningSolutionSchema,
  }),
  PlanItemBaseSchema.extend({
    taskType: z.literal('TYPE_WORD'),
    payload: TypeWordPayloadSchema,
    solution: TypeWordSolutionSchema,
  }),
  PlanItemBaseSchema.extend({
    taskType: z.literal('BUILD_SENTENCE'),
    payload: BuildSentencePayloadSchema,
    solution: BuildSentenceSolutionSchema,
  }),
]);
export type PlanItem = z.infer<typeof PlanItemSchema>;

export const PlanSchema = z.array(PlanItemSchema);
export type Plan = z.infer<typeof PlanSchema>;

// ─── SessionTask — PlanItem sanitized for the wire (no solution) ─────────────

export const SessionTaskSchema = z.discriminatedUnion('taskType', [
  z.object({
    id: z.string(),
    userWordId: z.string(),
    isRetry: z.boolean(),
    taskType: z.literal('PICK_MEANING'),
    payload: PickMeaningPayloadSchema,
  }),
  z.object({
    id: z.string(),
    userWordId: z.string(),
    isRetry: z.boolean(),
    taskType: z.literal('TYPE_WORD'),
    payload: TypeWordPayloadSchema,
  }),
  z.object({
    id: z.string(),
    userWordId: z.string(),
    isRetry: z.boolean(),
    taskType: z.literal('BUILD_SENTENCE'),
    payload: BuildSentencePayloadSchema,
  }),
]);
export type SessionTask = z.infer<typeof SessionTaskSchema>;

/** Strips `solution` off a PlanItem — the one place a plan item is allowed to cross the wire. */
export function sanitizePlanItem(item: PlanItem): SessionTask {
  const { solution: _solution, ...rest } = item;
  return rest as SessionTask;
}

// ─── DrillSession responses ────────────────────────────────────────────────

export const DrillSessionResponseSchema = z.object({
  id: z.string(),
  status: DrillSessionStatusSchema,
  isPractice: z.boolean(),
  currentIndex: z.number(),
  totalCount: z.number(), // frozen count of non-retry tasks — the "/10"
  practicedCount: z.number(), // non-retry tasks already answered
  startedAt: z.string(),
  tasks: z.array(SessionTaskSchema),
});
export type DrillSessionResponse = z.infer<typeof DrillSessionResponseSchema>;

export const CreateSessionResponseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('session'), session: DrillSessionResponseSchema }),
  z.object({ kind: z.literal('nothing_due') }),
]);
export type CreateSessionResponse = z.infer<typeof CreateSessionResponseSchema>;

// ─── Submitting an attempt ────────────────────────────────────────────────

const CanonicalTaskResponseSchema = z.discriminatedUnion('taskType', [
  z.object({ taskType: z.literal('PICK_MEANING'), chosenSenseId: z.string().nullable() }),
  z.object({ taskType: z.literal('TYPE_WORD'), text: z.string() }),
  z.object({ taskType: z.literal('BUILD_SENTENCE'), tileIds: z.array(z.string()) }),
]);
export const TaskResponseSchema = z.preprocess((value) => {
  if (value && typeof value === 'object' && 'taskType' in value && value.taskType === 'PICK_MEANING' && 'selectedOptionId' in value) {
    const legacy = value as Record<string, unknown>;
    return { ...legacy, chosenSenseId: legacy.selectedOptionId };
  }
  return value;
}, CanonicalTaskResponseSchema);
export type TaskResponse = z.infer<typeof TaskResponseSchema>;

export const SubmitAttemptRequestSchema = z.object({
  planItemId: z.string(),
  response: TaskResponseSchema,
  responseTimeMs: z.number().int().min(0),
});
export type SubmitAttemptRequest = z.infer<typeof SubmitAttemptRequestSchema>;

export const CorrectionSchema = z.object({
  correctAnswer: z.string(),
  emphasize: z.string().optional(), // substring of correctAnswer to bold
  tip: z.string(),
});
export type Correction = z.infer<typeof CorrectionSchema>;

export const SubmitAttemptResponseSchema = z.object({
  result: AttemptResultSchema,
  climbed: z.boolean(),
  requeued: z.boolean(),
  correction: CorrectionSchema.optional(), // present whenever result !== 'CORRECT'
  insertedRetryTask: SessionTaskSchema.optional(),
  currentIndex: z.number(),
  practicedCount: z.number(),
});
export type SubmitAttemptResponse = z.infer<typeof SubmitAttemptResponseSchema>;

// ─── Completing a session ──────────────────────────────────────────────────

export const MasteredWordSchema = z.object({
  userWordId: z.string(),
  displayForm: z.string(), // "der Hund"
});

export const SecondCardSlotSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('incomplete_nouns'), count: z.number() }),
  z.object({ type: z.literal('stuck_produce'), count: z.number() }),
  z.object({ type: z.literal('next_review'), dueLabel: z.string() }),
  z.object({ type: z.literal('none') }),
]);
export type SecondCardSlot = z.infer<typeof SecondCardSlotSchema>;

export const SessionCompleteResponseSchema = z.object({
  practiced: z.number(),
  correct: z.number(), // first attempts only
  leveledUp: z.number(),
  elapsedMs: z.number(),
  masteredWords: z.array(MasteredWordSchema),
  secondCard: SecondCardSlotSchema,
  // The real next session's size (same selection code as planPreview/composePlan) — the summary
  // screen's "Start next session" CTA count is never a guess.
  nextSessionCount: z.number().int().nonnegative(),
  // Words eligible for an optional practice session: not due, not NEW, and not touched by any
  // attempt already made today. 0 means the practice option must not be offered at all.
  practiceCount: z.number().int().nonnegative(),
});
export type SessionCompleteResponse = z.infer<typeof SessionCompleteResponseSchema>;

export const PracticeSessionRequestSchema = z.object({
  size: z.number().int().min(1).max(10),
  userWordId: z.string().optional(),
  // Pins the session to exactly these words (e.g. Progress's "Practice these 5") — takes
  // precedence over userWordId when both are present.
  userWordIds: z.array(z.string()).min(1).max(10).optional(),
});
export type PracticeSessionRequest = z.infer<typeof PracticeSessionRequestSchema>;
