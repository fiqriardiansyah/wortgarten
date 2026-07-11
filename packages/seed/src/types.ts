import { z } from 'zod';

// Slice of the kaikki/wiktextract JSONL entry shape we actually depend on.
// Deliberately `.passthrough()` on every object so unknown fields don't break
// parsing, but the fields we read are required-ish (optional with defaults)
// so a real format shift shows up as empty extraction, not a crash — caught
// by seed:verify and the end-of-run report rather than a mid-stream throw.

const KaikkiFormSchema = z
  .object({
    form: z.string(),
    tags: z.array(z.string()).default([]),
  })
  .passthrough();

const KaikkiExampleSchema = z
  .object({
    text: z.string().optional(),
  })
  .passthrough();

const KaikkiFormOfSchema = z
  .object({
    word: z.string(),
  })
  .passthrough();

const KaikkiSenseSchema = z
  .object({
    glosses: z.array(z.string()).default([]),
    raw_glosses: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    examples: z.array(KaikkiExampleSchema).default([]),
    form_of: z.array(KaikkiFormOfSchema).default([]),
  })
  .passthrough();

const KaikkiHeadTemplateSchema = z
  .object({
    name: z.string().optional(),
    args: z.record(z.string(), z.unknown()).default({}),
    expansion: z.string().optional(),
  })
  .passthrough();

// `categories` has appeared as both `string[]` and `{ name: string }[]`
// across kaikki dump versions — accept either and normalize downstream.
const KaikkiCategorySchema = z.union([z.string(), z.object({ name: z.string() }).passthrough()]);

export const KaikkiEntrySchema = z
  .object({
    word: z.string(),
    pos: z.string(),
    lang: z.string().optional(),
    lang_code: z.string(),
    senses: z.array(KaikkiSenseSchema).default([]),
    forms: z.array(KaikkiFormSchema).default([]),
    tags: z.array(z.string()).default([]),
    categories: z.array(KaikkiCategorySchema).default([]),
    head_templates: z.array(KaikkiHeadTemplateSchema).default([]),
  })
  .passthrough();

export type KaikkiEntry = z.infer<typeof KaikkiEntrySchema>;
export type KaikkiForm = z.infer<typeof KaikkiFormSchema>;
export type KaikkiSense = z.infer<typeof KaikkiSenseSchema>;

export function categoryName(c: z.infer<typeof KaikkiCategorySchema>): string {
  return typeof c === 'string' ? c : c.name;
}

// ─── Pass-2 output (ranked.json) ───────────────────────────────────────────

export const RankedLemmaSchema = z.object({
  lemma: z.string(),
  pos: z.string(),
  gender: z.enum(['MASCULINE', 'FEMININE', 'NEUTER']).nullable(),
  score: z.number(),
  rank: z.number(),
});
export type RankedLemma = z.infer<typeof RankedLemmaSchema>;

export const RankedFileSchema = z.object({
  generatedAt: z.string(),
  limit: z.number(),
  entries: z.array(RankedLemmaSchema),
});
export type RankedFile = z.infer<typeof RankedFileSchema>;
