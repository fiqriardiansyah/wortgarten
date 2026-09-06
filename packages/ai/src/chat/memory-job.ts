import { CHAT_MEMORY_MAX_FACTS } from '@wortgarten/shared';
import type { AiJob } from '@wortgarten/shared';
import type { ChatTurnHistoryEntry } from './chat-job';

// A running paragraph, not a transcript — keep the model from just concatenating history into an
// ever-growing wall of text (the whole point of compaction).
export const CHAT_MEMORY_MAX_SUMMARY_WORDS = 80;

/** Builds the CHAT_MEMORY AiJob — the night-only job that (re)writes one conversation's
 * MemoryNote. `oldFacts`/`oldSummary` are what the note already holds (empty on a first run, or
 * after "Forget this"); `newBubbles` are the messages created since `lastMessageId`, oldest
 * first. Everything rides in `meta`, same escape hatch STORY/CHAT_TURN already use — this job
 * type has no real use for `allowedWords`/`maxWords` (no vocabulary gate applies to a summary),
 * so they're set to harmless placeholders the checker never reads. */
export function buildMemoryJob(oldSummary: string, oldFacts: string[], newBubbles: ChatTurnHistoryEntry[], language: string): AiJob {
  return {
    type: 'CHAT_MEMORY',
    allowedWords: [],
    maxWords: CHAT_MEMORY_MAX_SUMMARY_WORDS,
    meta: {
      oldSummary,
      oldFacts,
      newBubbles,
      language,
      maxFacts: CHAT_MEMORY_MAX_FACTS,
    },
  };
}
