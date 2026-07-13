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
    // Wiktionary's own homograph discriminator: kaikki emits a separate top-level
    // entry per etymology section (e.g. "Bank" the bench vs "Bank" the financial
    // institution both appear as etymology_number 1 and 2 in the real dump).
    // Real data is inconsistent about the JSON type here — verified: ~3,355
    // entries (including "sein") carry it as a numeric *string* ("1") rather
    // than a number. z.coerce handles both without silently failing the whole
    // entry's validation (which would drop it from the dictionary entirely).
    etymology_number: z.coerce.number().optional(),
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
  // Lexeme-identity discriminators (see map.ts's lexemeCoreKey) — carried through
  // so Pass 3 can re-derive the exact same key when it re-streams the raw file
  // and must route each raw entry's forms to the one builder it actually belongs to.
  plural: z.string().nullable(),
  separablePrefix: z.string().nullable(),
  auxiliary: z.string().nullable(),
  pastParticiple: z.string().nullable(),
  // Informational only — never part of lexemeCoreKey. Null when this candidate
  // merged raw entries from more than one etymology (the "otherwise identical,
  // only etymology differs" guard).
  etymologyNumber: z.number().nullable(),
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
