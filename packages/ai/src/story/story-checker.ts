import { StoryDraftSchema } from '@wortgarten/shared';
import type { AiCheckedResult, AiJob, AiRawResult, StoryDraft } from '@wortgarten/shared';

/**
 * A shape gate, not a vocabulary gate: the only thing that rejects a draft is unusable output —
 * unparseable or empty. A word outside the user's allowlist is never an error (comprehensible
 * input, not a defect), so this no longer touches the dictionary at all. Resolution now happens
 * exactly once downstream, in `buildStoryFromDraft`. Sync, like `checkSanitySentence` — no DB
 * lookup left to await.
 */
export function checkStoryDraft(raw: AiRawResult, _job: AiJob): AiCheckedResult<StoryDraft> {
  const parsed = StoryDraftSchema.safeParse(raw.json);
  if (!parsed.success) {
    return { ok: false, reason: 'BAD_JSON', detail: raw.raw.slice(0, 500) };
  }

  const title = parsed.data.title.trim();
  const story = parsed.data.story.trim();
  if (!title || !story) {
    return { ok: false, reason: 'EMPTY', detail: 'story had no title or body text' };
  }

  const translation = parsed.data.translation?.trim() || null;
  return { ok: true, value: { title, story, translation }, provider: raw.provider };
}
