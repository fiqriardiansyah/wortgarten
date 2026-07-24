import { z } from 'zod';

// ─── Read / Reader contract ────────────────────────────────────────────────
//
// This is the frozen shape the overnight story-generation worker must produce.
// The web Reader does ZERO live tokenization/lemmatization — every token below
// is pre-resolved (lexemeId/senseId/status), exactly what the `tokenMap`
// precompute will output for real. The UI only ever does array/dictionary
// lookups against this shape; it must never re-derive it.
//
// Every nullable field is `.nullable()`, every optional key is `.optional()` —
// a punctuation token or a story with no translation must not crash the reader
// (the `für` / `statsByMode` crash class).

export const StoryTokenKindSchema = z.enum(['word', 'punct', 'space']);
export type StoryTokenKind = z.infer<typeof StoryTokenKindSchema>;

export const StoryTokenStatusSchema = z.enum(['known', 'new', 'function', 'unknown']);
export type StoryTokenStatus = z.infer<typeof StoryTokenStatusSchema>;

export const StoryTokenSchema = z.object({
  text: z.string(), // surface as printed, e.g. "läuft", "Hund", ","
  kind: StoryTokenKindSchema,
  lexemeId: z.string().nullable(), // resolved lemma; null for punct/space
  senseId: z.string().nullable(), // resolved sense if known, else null
  status: StoryTokenStatusSchema,
  // known    = in the user's bank            -> plain, tap = review
  // new      = one of the 1-2 intentional new words -> underlined accent orange, tap = add
  // function = top-frequency word (rank <= 200) -> plain, tap = review-lite
  // unknown  = SHOULD NOT APPEAR in a "100% your words" story; see coverageKnownPct note below

  // Bonus layer, same discipline as `coverImageUrl` below: null for punct/space tokens, for every
  // token on a story with no audio (flag off, generation failed, older story), and for any `word`
  // token the edge-tts alignment pass in packages/audio couldn't confidently place — see that
  // package's `align.ts` for the tolerant-match algorithm. Never required for the reader to work.
  audioStartMs: z.number().nullable().optional(),
  audioEndMs: z.number().nullable().optional(),
});
export type StoryToken = z.infer<typeof StoryTokenSchema>;

export const StoryParagraphSchema = z.object({
  tokens: z.array(StoryTokenSchema),
});
export type StoryParagraph = z.infer<typeof StoryParagraphSchema>;

export const StoryGlossaryEntrySchema = z.object({
  lexemeId: z.string(),
  displayLemma: z.string(), // article-aware, e.g. "der Hund", "neugierig"
  pos: z.string(), // human label, e.g. "noun" — NOT an enum, never render ALL_CAPS
  translation: z.string(),
});
export type StoryGlossaryEntry = z.infer<typeof StoryGlossaryEntrySchema>;

export const StorySourceSchema = z.enum(['GROQ', 'OLLAMA', 'SEED', 'USER']);
export type StorySource = z.infer<typeof StorySourceSchema>;

// Whether edge-tts alignment (packages/audio's align.ts) achieved per-word confidence or had to
// degrade to per-sentence spans — see `sentenceTimings` below. Null whenever `audioUrl` is null.
export const StoryAudioSyncSchema = z.enum(['wordLevel', 'sentenceLevel']);
export type StoryAudioSync = z.infer<typeof StoryAudioSyncSchema>;

// Only populated (and only meaningful) when audioSync === 'sentenceLevel' — one span per sentence,
// covering every token in `paragraphs[paragraphIndex].tokens[startTokenIndex..endTokenIndex]`
// (inclusive), so the Reader can highlight the whole current line instead of a single word.
export const SentenceTimingSchema = z.object({
  paragraphIndex: z.number(),
  startTokenIndex: z.number(),
  endTokenIndex: z.number(),
  startMs: z.number(),
  endMs: z.number(),
});
export type SentenceTiming = z.infer<typeof SentenceTimingSchema>;

export const StoryStatusSchema = z.enum(['READY', 'GENERATING']);
export type StoryStatus = z.infer<typeof StoryStatusSchema>;

export const StorySchema = z.object({
  id: z.string(),
  title: z.string(),
  blurb: z.string().nullable(),
  status: StoryStatusSchema,
  source: StorySourceSchema.nullable(),
  estMinutes: z.number(),
  isNewToday: z.boolean(),
  // Decides the "100% your words" badge. The badge shows ONLY when every word token is
  // known/function/(intentional) new — if any `unknown` token exists it must NOT show. The
  // checker (later, plain code, not this schema) guarantees that before a story is ever stored
  // READY. The UI trusts this flag but must degrade gracefully if it's ever wrong: render the
  // word plainly, never crash.
  coverageKnownPct: z.number(),
  paragraphs: z.array(StoryParagraphSchema),
  translation: z.string().nullable(),
  newWords: z.array(z.string()), // lexemeIds of the 1-2 intentional new words in this story
  glossary: z.record(z.string(), StoryGlossaryEntrySchema), // keyed by lexemeId, covers every word token
  createdAt: z.string(),
  // Bonus layer, generated (if ever) strictly after this story is already stored and readable —
  // null means "no cover yet" (flag off, generation failed, or an older story), never an error.
  coverImageUrl: z.string().nullable(),
  // Listen Mode — same bonus-layer discipline as coverImageUrl. `audioSync` and `sentenceTimings`
  // are only meaningful when `audioUrl` is non-null; word-level timings (when achieved) live on
  // each `StoryToken` instead of a separate array.
  audioUrl: z.string().nullable(),
  audioSync: StoryAudioSyncSchema.nullable(),
  sentenceTimings: z.array(SentenceTimingSchema).nullable(),
  // Not in the original design doc's field list, but the "Earlier stories" library needs a read
  // state per story (the "✓ read" chip) and there's nowhere else to derive it from client-side —
  // the real worker/API will need to track this too (e.g. via a UserStory join).
  isRead: z.boolean(),
  // World.key, not a denormalized name/icon — the client already fetches the worlds list for the
  // Worlds card and looks up {name, icon} from that same cache. Null for stories generated before
  // Story Worlds shipped, or when the user had no unlocked world to pick from.
  worldKey: z.string().nullable(),
});
export type Story = z.infer<typeof StorySchema>;

export const ReadingLevelSchema = z.object({
  wordsUnlocked: z.number(),
  nextThreshold: z.number(),
  nextUnlockLabel: z.string(), // "5-minute stories"
  wordsToGo: z.number(),
});
export type ReadingLevel = z.infer<typeof ReadingLevelSchema>;

// What to tell the UI about the NEXT story when there's no unread one waiting to be read right
// now. `null` means there IS an unread story (the `stories` array already has it) — nothing
// "pending" to announce. Otherwise: still eligible and not produced yet ('generating', same
// copy/urgency as before), or today's one new story already got read and the next only unlocks at
// the user's local midnight ('waitingTomorrow' — same day boundary @wortgarten/shared's
// localDateKey gives the streak). Computed once by StoriesService so Home and Read never disagree.
export const StoryCadenceStateSchema = z.enum(['generating', 'waitingTomorrow']);
export type StoryCadenceState = z.infer<typeof StoryCadenceStateSchema>;

// Aggregate response for the library screen — same pattern as HomeDashboardSchema /
// ProgressDashboardSchema: one endpoint, one wrapper schema, built from the domain types above.
export const LibraryResponseSchema = z.object({
  stories: z.array(StorySchema),
  readingLevel: ReadingLevelSchema,
  pendingState: StoryCadenceStateSchema.nullable(),
});
export type LibraryResponse = z.infer<typeof LibraryResponseSchema>;
