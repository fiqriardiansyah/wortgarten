import { ChatTurnDraftSchema } from '@wortgarten/shared';
import type { AiCheckedResult, AiJob, AiRawResult, StoryGlossaryEntry, StoryToken } from '@wortgarten/shared';
import type { LexemeResolver } from '../story/lexeme-resolver';
import { tokenizeAgainstAllowlist } from '../story/build-story-tokens';

export interface CheckedChatTurn {
  reply: string;
  translation: string | null;
  tokens: StoryToken[];
  glossary: Record<string, StoryGlossaryEntry>;
  coverageKnownPct: number;
  // Iteration 2 (reply variety): raw suggestedReplies that individually clear minCoveragePct — the
  // reply director (@wortgarten/ai's pickNextReplyPlan) is the only consumer. Never blocks the
  // turn itself: a reply with zero surviving suggestions is still a normal ok:true result.
  suggestedReplies: string[];
}

interface ChatTurnCheckerMeta {
  allowlistIds: string[];
  knownLexemeIds: string[];
  knownSenseByLexeme: Record<string, string>;
  minCoveragePct: number;
  language: string;
}

/**
 * A coverage gate, not a shape-only gate like checkStoryDraft: this is what caps a character's
 * reply to the reader's level. Resolves the reply once (via `tokenizeAgainstAllowlist`, the same
 * resolver `buildStoryFromDraft` uses) and rejects below `job.meta.minCoveragePct` — AiService's
 * existing retry loop then tries again against GROQ automatically; no hand-written "regenerate
 * once" step. On success, returns everything `run-chat-turn.ts` needs to persist the character
 * Message directly, so the reply is never re-resolved downstream.
 *
 * Factory, not a bare function, because — unlike checkStoryDraft — this checker needs a DB-backed
 * `LexemeResolver` closed over at wiring time (see ai.module.ts).
 */
export function createCheckChatTurn(resolver: LexemeResolver) {
  return async function checkChatTurn(raw: AiRawResult, job: AiJob): Promise<AiCheckedResult<CheckedChatTurn>> {
    const parsed = ChatTurnDraftSchema.safeParse(raw.json);
    if (!parsed.success) {
      return { ok: false, reason: 'BAD_JSON', detail: raw.raw.slice(0, 500) };
    }

    const reply = parsed.data.reply.trim();
    if (!reply) {
      return { ok: false, reason: 'EMPTY', detail: 'reply was empty after trimming' };
    }
    const translation = parsed.data.translation?.trim() || null;

    const meta = (job.meta ?? {}) as unknown as ChatTurnCheckerMeta;
    const knownLexemeIds = new Set(meta.knownLexemeIds);

    const resolved = await tokenizeAgainstAllowlist(
      resolver,
      reply,
      {
        allowlistIds: new Set(meta.allowlistIds),
        knownSenseByLexeme: new Map(Object.entries(meta.knownSenseByLexeme)),
        statusFor: (lexemeId) => (knownLexemeIds.has(lexemeId) ? 'known' : 'function'),
      },
      meta.language,
    );

    const coverageKnownPct =
      resolved.totalWordCount === 0 ? 100 : Math.round(((resolved.totalWordCount - resolved.unknownWordCount) / resolved.totalWordCount) * 100);

    if (coverageKnownPct < meta.minCoveragePct) {
      return { ok: false, reason: 'TOO_HARD', detail: `coverage ${coverageKnownPct}% below ${meta.minCoveragePct}% floor: "${reply}"` };
    }

    const suggestedReplies = await filterSuggestedReplies(resolver, parsed.data.suggestedReplies ?? [], meta);

    return {
      ok: true,
      value: { reply, translation, tokens: resolved.tokens, glossary: resolved.glossary, coverageKnownPct, suggestedReplies },
      provider: raw.provider,
    };
  };
}

/** Same coverage gate as the reply itself, applied independently to each candidate — a
 * suggestedReply is raw material for "choice"/"tiles", so it must be exactly as safe as the reply
 * it rides alongside. Never rejects the turn: a candidate that fails just isn't offered. */
async function filterSuggestedReplies(resolver: LexemeResolver, candidates: string[], meta: ChatTurnCheckerMeta): Promise<string[]> {
  const knownLexemeIds = new Set(meta.knownLexemeIds);
  const kept: string[] = [];
  for (const candidate of candidates) {
    const text = candidate.trim();
    if (!text) continue;
    const resolved = await tokenizeAgainstAllowlist(
      resolver,
      text,
      {
        allowlistIds: new Set(meta.allowlistIds),
        knownSenseByLexeme: new Map(Object.entries(meta.knownSenseByLexeme)),
        statusFor: (lexemeId) => (knownLexemeIds.has(lexemeId) ? 'known' : 'function'),
      },
      meta.language,
    );
    const coveragePct = resolved.totalWordCount === 0 ? 100 : Math.round(((resolved.totalWordCount - resolved.unknownWordCount) / resolved.totalWordCount) * 100);
    if (coveragePct >= meta.minCoveragePct) kept.push(text);
  }
  return kept;
}
