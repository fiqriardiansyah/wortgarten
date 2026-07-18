import { StoryDraftSchema, tokenize } from '@wortgarten/shared';
import type { AiCheckedResult, AiJob, AiRawResult, StoryDraft } from '@wortgarten/shared';
import type { LexemeResolver } from './lexeme-resolver';

// maxWords is a target for STORY (unlike SANITY_SENTENCE's hard ceiling) — a model naturally
// over/undershoots a word-count instruction by a bit, and rejecting anything over target would
// waste retries on drafts that are otherwise perfectly fine.
const LENGTH_SLACK = 1.5;

/**
 * The guarantee that makes trusting a small model safe: every content word in the draft must
 * resolve (via LexemeResolver, the same tokenize → lemma-resolve → separable-verb-reassemble
 * pipeline LookupService uses) to a lexemeId on the job's allowlist. Compared by id, never by the
 * surface/lemma string — a homograph outside the allowlist must be caught even though its spelling
 * matches an allowed word. A word that fails to resolve at all is treated exactly like one that
 * resolves outside the allowlist: either way, it's not one of the user's words.
 */
export function makeStoryChecker(resolver: LexemeResolver, language = 'de') {
  return async function checkStoryDraft(raw: AiRawResult, job: AiJob): Promise<AiCheckedResult<StoryDraft>> {
    const parsed = StoryDraftSchema.safeParse(raw.json);
    if (!parsed.success) {
      return { ok: false, reason: 'BAD_JSON', detail: raw.raw.slice(0, 300) };
    }

    const { title, paragraphs } = parsed.data;
    if (!title.trim() || paragraphs.length === 0 || paragraphs.every((p) => !p.trim())) {
      return { ok: false, reason: 'EMPTY', detail: 'story had no title or paragraphs' };
    }
    // A missing/blank translation is never a rejection reason — unlike vocabulary, it isn't a
    // safety property, so a model that omits it shouldn't cost a retry. Normalize to `null` here
    // so every caller downstream sees the same shape the frozen `Story.translation` expects.
    const translation = parsed.data.translation?.trim() || null;

    const totalWords = paragraphs.reduce((n, p) => n + tokenize(p).length, 0);
    if (totalWords > job.maxWords * LENGTH_SLACK) {
      return { ok: false, reason: 'TOO_LONG', detail: `${totalWords} words exceeds target ${job.maxWords}` };
    }

    const meta = (job.meta ?? {}) as { allowlistLexemeIds?: string[] };
    const allowlistIds = new Set(meta.allowlistLexemeIds ?? []);

    const offenders: string[] = [];
    for (const paragraph of paragraphs) {
      const slots = await resolver.lookupSentence(paragraph, language);
      for (const slot of slots) {
        const hit = slot.matches.find((m) => allowlistIds.has(m.lexeme.id));
        if (!hit) offenders.push(slot.tokens.join(' '));
      }
    }
    if (offenders.length > 0) {
      return { ok: false, reason: 'USED_DISALLOWED_WORD', detail: offenders.slice(0, 5).join(', ') };
    }

    return { ok: true, value: { title, paragraphs, translation }, provider: raw.provider };
  };
}
