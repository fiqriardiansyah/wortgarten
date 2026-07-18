import { z } from 'zod';

// ─── AI spine contracts ─────────────────────────────────────────────────────
//
// Provider-agnostic, framework-free, pure. This is the shape every adapter (Groq,
// Ollama, or a fake in tests) must produce, and the shape the checker below
// validates before anything downstream trusts it. Every nullable field is
// `.nullable()`, every optional key is `.optional()`.
//
// Hard rule (architecture, not a comment to skip): the model is NEVER used for SRS
// math, session building, distractor selection, or any NLP/lemmatization/tokenization,
// and it never CHOOSES vocabulary — `allowedWords` is built by plain code upstream and
// merely passed in. The checker below is what makes trusting a small model safe.

export const AiProviderSchema = z.enum(['GROQ', 'OLLAMA']);
export type AiProvider = z.infer<typeof AiProviderSchema>;

// SANITY_SENTENCE proved the spine; STORY is the first real content job on top of it.
export const AiJobTypeSchema = z.enum(['SANITY_SENTENCE', 'STORY']);
export type AiJobType = z.infer<typeof AiJobTypeSchema>;

export const AiJobSchema = z.object({
  type: AiJobTypeSchema,
  // For SANITY_SENTENCE: write ONE short German sentence using ONLY these words.
  // For STORY: the full known+function+new allowlist, as display lemmas ("der Hund", not "Hund").
  // Either way, chosen by plain code upstream — the model never picks words.
  allowedWords: z.array(z.string()),
  // For SANITY_SENTENCE: a hard word-count ceiling. For STORY: the target total word count.
  maxWords: z.number().int().positive(),
  // STORY stashes its lexemeId allowlist here (`allowlistLexemeIds`, `newWordLexemeIds`,
  // `newWordDisplayLemmas`) — the checker must compare by id, never by the display-lemma
  // strings above (a homograph outside the allowlist must be caught by id, not fooled by
  // spelling — see checkStoryDraft in @wortgarten/ai).
  meta: z.record(z.string(), z.unknown()).nullable().optional(),
});
export type AiJob = z.infer<typeof AiJobSchema>;

// Both adapters (and the fake) must return exactly this shape.
export const AiRawResultSchema = z.object({
  provider: AiProviderSchema,
  json: z.unknown(), // the model's parsed JSON — unchecked until the checker runs
  raw: z.string(), // raw text, kept for logging on failure
});
export type AiRawResult = z.infer<typeof AiRawResultSchema>;

export const AiCheckFailReasonSchema = z.enum(['BAD_JSON', 'EMPTY', 'TOO_LONG', 'USED_DISALLOWED_WORD', 'OTHER']);
export type AiCheckFailReason = z.infer<typeof AiCheckFailReasonSchema>;

/** What a checker function returns. Never a thrown error — bad model output is an
 * expected, handled outcome, not an exception. */
export type AiCheckedResult<T> =
  | { ok: true; value: T; provider: AiProvider }
  | { ok: false; reason: AiCheckFailReason; detail: string };

// ─── SANITY_SENTENCE ─────────────────────────────────────────────────────

export const SanitySentenceSchema = z.object({ sentence: z.string() });
export type SanitySentence = z.infer<typeof SanitySentenceSchema>;

/** Lowercase, strip surrounding/interior punctuation, but keep umlauts and ß — an umlaut is
 * not a typo. "schön" and "schon" must stay distinguishable. */
export function normalizeGermanWord(word: string): string {
  return word.toLowerCase().replace(/[^a-zäöüß]/g, '');
}

/** The checker — plain code, not AI. This is what makes a small model safe to trust: every
 * output is verified against the allowlist before anything downstream sees it. Never throws;
 * bad model output is expected and handled, not exceptional. */
export function checkSanitySentence(raw: AiRawResult, job: AiJob): AiCheckedResult<SanitySentence> {
  const parsed = SanitySentenceSchema.safeParse(raw.json);
  if (!parsed.success) {
    return { ok: false, reason: 'BAD_JSON', detail: raw.raw.slice(0, 300) };
  }

  const sentence = parsed.data.sentence.trim();
  if (sentence.length === 0) {
    return { ok: false, reason: 'EMPTY', detail: 'sentence was empty after trimming' };
  }

  const words = sentence.split(/\s+/).filter(Boolean);
  if (words.length > job.maxWords) {
    return { ok: false, reason: 'TOO_LONG', detail: `${words.length} words exceeds maxWords ${job.maxWords}` };
  }

  const allowedSet = new Set(job.allowedWords.map(normalizeGermanWord));
  for (const word of words) {
    const normalized = normalizeGermanWord(word);
    if (!normalized) continue; // pure punctuation token, e.g. "-" alone — not a word
    if (!allowedSet.has(normalized)) {
      return { ok: false, reason: 'USED_DISALLOWED_WORD', detail: word };
    }
  }

  return { ok: true, value: { sentence }, provider: raw.provider };
}

// ─── STORY ──────────────────────────────────────────────────────────────────
//
// The draft the model returns — plain German text, not yet tokenized. Checking it against the
// allowlist (by lexemeId, via LookupService/LexemeResolver) and building the frozen
// StoryToken/StoryGlossaryEntry shape both require a DB-backed dictionary lookup, so unlike
// checkSanitySentence above, the STORY checker/builder are NOT pure functions here — they live in
// @wortgarten/ai (checkStoryDraft, buildStoryFromDraft), the one package with DB access.

export const StoryDraftSchema = z.object({
  title: z.string(),
  paragraphs: z.array(z.string()),
  // Optional: an English translation is a nice-to-have, not a safety property the checker must
  // enforce (unlike vocabulary, which it always must) — a model that omits it should not cost a
  // retry. checkStoryDraft normalizes a missing/blank value to `null`, matching the frozen
  // `Story.translation` contract in packages/shared/src/story.ts.
  translation: z.string().nullable().optional(),
});
export type StoryDraft = z.infer<typeof StoryDraftSchema>;
