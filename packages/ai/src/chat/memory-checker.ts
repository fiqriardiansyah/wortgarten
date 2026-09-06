import { MemoryNoteDraftSchema } from '@wortgarten/shared';
import type { AiCheckedResult, AiJob, AiRawResult } from '@wortgarten/shared';
import { filterSafeFacts, sanitizeSummary } from './memory-safety';

export interface CheckedMemoryNote {
  summary: string;
  facts: string[];
}

interface ChatMemoryCheckerMeta {
  maxFacts: number;
}

/**
 * A shape-plus-safety gate, not a coverage gate like checkChatTurn — CHAT_MEMORY carries no
 * vocabulary allowlist, so there's nothing to resolve against a dictionary and this checker needs
 * no DB access (unlike createCheckChatTurn's LexemeResolver). The safety filter
 * (memory-safety.ts) is the part that actually matters: it runs independently of whatever the
 * night summariser's prompt asked for, so a model that ignores its own instructions still can't
 * leak an identifying detail into a stored note.
 */
export function checkMemoryNote(raw: AiRawResult, job: AiJob): AiCheckedResult<CheckedMemoryNote> {
  const parsed = MemoryNoteDraftSchema.safeParse(raw.json);
  if (!parsed.success) {
    return { ok: false, reason: 'BAD_JSON', detail: raw.raw.slice(0, 500) };
  }

  const meta = (job.meta ?? {}) as unknown as ChatMemoryCheckerMeta;
  const summary = sanitizeSummary(parsed.data.summary.trim());
  const facts = filterSafeFacts(parsed.data.facts ?? [], meta.maxFacts);

  // A note with an empty summary and zero facts (everything got filtered, or nothing notable
  // happened this batch) is still a valid outcome, not a failure — build-memory-note.ts stores it
  // as-is. Rejecting it here would mean a single off-topic batch throws away a perfectly fine
  // "nothing to add" result and leaves the OLD note stale for no reason.
  return { ok: true, value: { summary, facts }, provider: raw.provider };
}
