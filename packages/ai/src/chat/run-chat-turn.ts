import type { PrismaClient } from '@wortgarten/database';
import type { StoryGlossaryEntry, StoryToken } from '@wortgarten/shared';
import type { AiService } from '../ai.service';
import { tokenizeAgainstAllowlist } from '../story/build-story-tokens';
import type { LexemeResolver } from '../story/lexeme-resolver';
import { buildChatTurnJob, type ChatTurnHistoryEntry } from './chat-job';
import type { CheckedChatTurn } from './chat-checker';
import { buildChatSystemPrompt, type ChatMemoryInput, type PersonaInput } from './persona-prompt';
import { pickScriptedReply } from './scripted-replies';
import { selectChatVocabulary } from './select-chat-vocabulary';

export interface RunChatTurnParams {
  userId: string;
  language?: string;
  persona: PersonaInput & { archetype: string };
  /** Null for the pinned default host (no story to be "in"). */
  storyTitle: string | null;
  history: ChatTurnHistoryEntry[];
  userText: string;
  /** SEAM 2's "groq" path is only ever attempted when true — STORY_CHAT_ENABLED off means the
   * chat runs on "scripted" alone, same as the whole feature would with Groq itself unreachable. */
  allowGroq: boolean;
  /** Iteration 5 (memory): the conversation's MemoryNote, or null/undefined for "no memory line"
   * — CHAT_MEMORY_ENABLED off, no note written yet, or the user cleared it via "Forget this". The
   * scripted fallback never sees this (the hand-written bank is unaffected by design). */
  memoryNote?: ChatMemoryInput | null;
}

export interface ChatTurnResult {
  text: string;
  translation: string | null;
  tokens: StoryToken[];
  glossary: Record<string, StoryGlossaryEntry>;
  source: 'groq' | 'scripted';
  // Iteration 2 (reply variety): raw material for the reply director. Always empty on the
  // "scripted" path — a scripted line rides no model call, so there's nothing to suggest from
  // (the director just falls through to its next rule; see reply-director.ts).
  suggestedReplies: string[];
}

/**
 * SEAM 2 (the turn source): tries GROQ (through the existing AiService spine, daytime-only —
 * `remoteOnly: true` means it can never fall through to OLLAMA), falls back to a scripted
 * in-world line on any failure (quota exhausted, checker rejected every retry, or `allowGroq` is
 * false). A chat never dies mid-turn; it just gets a simpler brain. Adding a `"night"` source
 * later is a third branch here, not an endpoint change.
 */
export async function runChatTurn(
  prisma: PrismaClient,
  aiService: AiService,
  resolver: LexemeResolver,
  params: RunChatTurnParams,
): Promise<ChatTurnResult> {
  const language = params.language ?? 'de';
  const vocab = await selectChatVocabulary(prisma, params.userId, language);
  const statusFor = (lexemeId: string) => (vocab.knownLexemeIds.has(lexemeId) ? ('known' as const) : ('function' as const));

  if (params.allowGroq) {
    const systemPrompt = buildChatSystemPrompt(params.persona, params.storyTitle, params.memoryNote);
    const job = buildChatTurnJob(vocab, systemPrompt, params.history, params.userText, language);
    const result = await aiService.run(job, { remoteOnly: true });
    if (result.ok) {
      const value = result.value as CheckedChatTurn;
      return {
        text: value.reply,
        translation: value.translation,
        tokens: value.tokens,
        glossary: value.glossary,
        source: 'groq',
        suggestedReplies: value.suggestedReplies,
      };
    }
    console.error(`[runChatTurn] GROQ path failed (${result.reason}: ${result.detail}) — falling back to scripted`);
  }

  const scripted = pickScriptedReply(params.persona.archetype);
  const resolved = await tokenizeAgainstAllowlist(
    resolver,
    scripted.text,
    { allowlistIds: vocab.allowlistIds, knownSenseByLexeme: vocab.knownSenseByLexeme, statusFor },
    language,
  );

  return { text: scripted.text, translation: scripted.translation, tokens: resolved.tokens, glossary: resolved.glossary, source: 'scripted', suggestedReplies: [] };
}
