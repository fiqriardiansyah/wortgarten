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

// SANITY_SENTENCE proved the spine; STORY is the first real content job on top of it. CHAT_TURN
// (Story Chat) is a third: a character's reply, capped to the reader's level by a coverage check
// instead of a shape-only gate — see checkChatTurn in packages/ai/src/chat/chat-checker.ts.
// CHAT_MEMORY (iteration 5) is a fourth: a NIGHT-ONLY job (never the daytime request path) that
// (re)writes a conversation's running summary/facts — see build-memory-note.ts.
export const AiJobTypeSchema = z.enum(['SANITY_SENTENCE', 'STORY', 'CHAT_TURN', 'CHAT_MEMORY']);
export type AiJobType = z.infer<typeof AiJobTypeSchema>;

export const AiJobSchema = z.object({
  type: AiJobTypeSchema,
  // For SANITY_SENTENCE: write ONE short German sentence using ONLY these words.
  // For STORY: the full known+function+new allowlist, as display lemmas ("der Hund", not "Hund").
  // Either way, chosen by plain code upstream — the model never picks words.
  allowedWords: z.array(z.string()),
  // For SANITY_SENTENCE: a hard word-count ceiling. For STORY: the target total word count.
  maxWords: z.number().int().positive(),
  // STORY stashes `newWordDisplayLemmas` here for the prompt's "feature this word" line — the
  // checker doesn't touch vocabulary at all; resolution against the real lexemeId allowlist
  // happens once, downstream in @wortgarten/ai's buildStoryFromDraft.
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

export const AiCheckFailReasonSchema = z.enum([
  'BAD_JSON',
  'EMPTY',
  'TOO_LONG',
  'USED_DISALLOWED_WORD',
  // CHAT_TURN only: the reply resolved fine (real German, well-formed JSON) but its vocabulary
  // coverage against the reader's own allowlist fell below the turn's minCoveragePct — distinct
  // from TOO_LONG (a word-count gate). Triggers the same retry-then-REMOTE_QUOTA_EXHAUSTED path
  // as any other checker failure; never touches OLLAMA (see AiService.run's remoteOnly).
  'TOO_HARD',
  // A remote-only run (daytime lazy generation) found the GROQ free quota exhausted, or exhausted
  // its retries on GROQ — never a checker verdict. The one signal that must never fall back to
  // OLLAMA, so it can't be conflated with a real checker failure.
  'REMOTE_QUOTA_EXHAUSTED',
  'OTHER',
]);
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
  // The whole German text, paragraphs separated by a blank line (\n\n) — a flat string, not a
  // nested array. A small model reliably produces one JSON string far more often than an array of
  // strings (trailing commas, unterminated arrays); @wortgarten/ai's buildStoryFromDraft splits
  // this back into the frozen `Story` contract's `paragraphs`.
  story: z.string(),
  // Optional: an English translation is a nice-to-have, not a safety property the checker must
  // enforce (unlike shape, which it always must) — a model that omits it should not cost a
  // retry. checkStoryDraft normalizes a missing/blank value to `null`, matching the frozen
  // `Story.translation` contract in packages/shared/src/story.ts.
  translation: z.string().nullable().optional(),
  // Story Chat (see chat.ts): the story's lead character, generated in this same call so no
  // second AI request is needed just for persona. All optional/nullable — a model that omits
  // them costs no retry (checkStoryDraft normalizes to null; generateStoryForUser then simply
  // skips the bonus Character-attach step, same as a failed cover image or audio attach).
  characterName: z.string().nullable().optional(),
  characterRole: z.string().nullable().optional(),
  characterPersonaLine: z.string().nullable().optional(),
  characterArchetype: z.string().nullable().optional(),
});
export type StoryDraft = z.infer<typeof StoryDraftSchema>;

// ─── CHAT_TURN ──────────────────────────────────────────────────────────────
//
// The draft a character's reply, before resolution — plain German text plus its English
// translation. Same reasoning as STORY: checking it against the reader's level (a coverage
// percentage, by lexemeId) and tokenizing it into StoryToken/StoryGlossaryEntry both require a
// DB-backed dictionary lookup, so this checker also lives in @wortgarten/ai (createCheckChatTurn),
// not here — this schema is just the shape gate.

export const ChatTurnDraftSchema = z.object({
  reply: z.string(),
  translation: z.string().nullable().optional(),
  // Iteration 2 (reply variety): 0-3 short ready-made replies the user could send next, raw from
  // the model — chat-checker.ts re-runs the same level check on each before they're usable, so a
  // missing/omitted field (older prompt, model that ignores the instruction) costs nothing.
  suggestedReplies: z.array(z.string()).max(3).optional(),
});
export type ChatTurnDraft = z.infer<typeof ChatTurnDraftSchema>;

// ─── CHAT_MEMORY (iteration 5: memory) ───────────────────────────────────────
//
// The nightly summariser's draft, before the safety filter runs — plain code (memory-safety.ts)
// still enforces the deny list independently of whatever the model was instructed to omit; see
// packages/ai/src/chat/memory-checker.ts. `facts` is capped generously here (the checker applies
// the real, smaller cap — CHAT_MEMORY_MAX_FACTS) so an over-eager model costs nothing but a trim.

export const MemoryNoteDraftSchema = z.object({
  summary: z.string(),
  facts: z.array(z.string()).max(16).optional(),
});
export type MemoryNoteDraft = z.infer<typeof MemoryNoteDraftSchema>;
