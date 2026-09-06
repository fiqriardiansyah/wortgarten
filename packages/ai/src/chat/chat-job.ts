import type { AiJob } from '@wortgarten/shared';
import type { ChatVocabulary } from './select-chat-vocabulary';

// Below this coverage, checkChatTurn rejects the draft (see chat-checker.ts) and AiService's
// existing retry loop tries again against GROQ — no hand-written "regenerate once" step needed.
export const CHAT_MIN_COVERAGE_PCT = 80;
// A learner-friendly reply length ceiling — short, like a real chat message.
export const CHAT_MAX_REPLY_WORDS = 40;

export interface ChatTurnHistoryEntry {
  role: 'user' | 'character';
  text: string;
}

/** Builds the CHAT_TURN AiJob. Everything the checker/prompt need beyond the fixed
 * allowedWords/maxWords fields rides in `meta` — the same escape hatch STORY already uses for
 * `newWordDisplayLemmas`/`worldHint` (see story-job.ts). `language` rides along too: the checker
 * resolves the reply via `tokenizeAgainstAllowlist`, which defaults to 'de' if never told
 * otherwise — that default must never silently substitute for the conversation's real language. */
export function buildChatTurnJob(
  vocab: ChatVocabulary,
  systemPrompt: string,
  history: ChatTurnHistoryEntry[],
  userText: string,
  language: string,
): AiJob {
  return {
    type: 'CHAT_TURN',
    allowedWords: vocab.allowlistDisplay,
    maxWords: CHAT_MAX_REPLY_WORDS,
    meta: {
      systemPrompt,
      allowlistDisplay: vocab.allowlistDisplay,
      history,
      userText,
      language,
      allowlistIds: [...vocab.allowlistIds],
      knownLexemeIds: [...vocab.knownLexemeIds],
      knownSenseByLexeme: Object.fromEntries(vocab.knownSenseByLexeme),
      minCoveragePct: CHAT_MIN_COVERAGE_PCT,
    },
  };
}
