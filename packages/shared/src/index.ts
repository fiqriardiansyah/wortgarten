import { z } from 'zod';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const WordLevelSchema = z.enum(['new', 'learning', 'mastered']);
export type WordLevel = z.infer<typeof WordLevelSchema>;

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
  wordCount: z.number(),
  estMinutes: z.number(),
  taskBreakdown: z.object({
    flashcards: z.number(),
    recalls: z.number(),
    sentenceBuilds: z.number(),
  }),
  previewWords: z.array(z.string()),
});
export type SessionSummary = z.infer<typeof SessionSummarySchema>;

export const RustyGroupSchema = z.object({
  count: z.number(),
  wordsPreview: z.array(z.string()),
  extraCount: z.number(),
});
export type RustyGroup = z.infer<typeof RustyGroupSchema>;

export const StoryTeaserSchema = z.object({
  id: z.string(),
  title: z.string(),
  coverage: z.string(),
  minutes: z.number(),
});
export type StoryTeaser = z.infer<typeof StoryTeaserSchema>;

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

// ─── Home dashboard ───────────────────────────────────────────────────────────

export const HomeDashboardSchema = z.object({
  greeting: z.string(),
  daySubtitle: z.string(),
  streakDays: z.number(),
  session: SessionSummarySchema,
  rusty: RustyGroupSchema,
  quest: QuestSchema,
  garden: GardenStatsSchema,
  story: StoryTeaserSchema,
  recentlyAdded: z.array(WordSummarySchema),
  user: z.object({
    name: z.string(),
    tagline: z.string(),
  }),
});
export type HomeDashboard = z.infer<typeof HomeDashboardSchema>;
