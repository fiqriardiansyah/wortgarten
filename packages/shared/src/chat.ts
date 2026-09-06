import { z } from 'zod';
import { StoryGlossaryEntrySchema, StoryTokenSchema } from './story';

// ─── Story Chat contract (iteration 1) ──────────────────────────────────────
//
// Mirrors story.ts's discipline: the frontend does zero tokenization/resolution — every character
// bubble arrives with tokens/glossary already resolved server-side. Reuses StoryTokenSchema /
// StoryGlossaryEntrySchema verbatim (see the plan's deviation note) rather than a third shape, so
// MessageBubble can share StoryBody's/WordPopup's rendering almost unchanged.

// SEAM 1 (the reply slot): only "type" is wired in iteration 1. The other three are real,
// typed variants a future iteration renders behind the exact same ReplySlotProps — no other file
// (ChatThreadPage, chat.controller.ts) needs to know which one produced the text.
export const ReplyModeSchema = z.enum(['type', 'tiles', 'speak', 'choice']);
export type ReplyMode = z.infer<typeof ReplyModeSchema>;

// SEAM 2 (the turn source): "groq" | "scripted" in iteration 1; "night" plugs in later without a
// contract change — it's just a third value a character Message.source can carry.
export const TurnSourceNameSchema = z.enum(['groq', 'scripted', 'night']);
export type TurnSourceName = z.infer<typeof TurnSourceNameSchema>;

export const MessageSenderSchema = z.enum(['user', 'character']);
export type MessageSender = z.infer<typeof MessageSenderSchema>;

// ─── Story Chat contract (iteration 2: reply variety) ───────────────────────
//
// The reply director's output — server-side, plain code (see @wortgarten/ai's reply-director.ts),
// never an AI call. Only "type" | "tiles" | "choice": "speak" is a future renderer on the same
// slot (Seam 1), not something the director ever picks yet.
export const NextReplyModeSchema = z.enum(['type', 'tiles', 'choice']);
export type NextReplyMode = z.infer<typeof NextReplyModeSchema>;

// One rusty word to nudge into the conversation, pre-resolved server-side: `lexemeId` is what
// SrsService.applyPassiveReview keys on (kept for a future "which nudge landed" analytic),
// `display` is what the chip actually renders/inserts — the frontend still does zero lexicon
// lookups of its own (see this file's opening doc comment), so a bare lexemeId here would be
// useless to render.
export const RustyWordHintSchema = z.object({
  lexemeId: z.string(),
  display: z.string(),
});
export type RustyWordHint = z.infer<typeof RustyWordHintSchema>;

export const ReplyScaffoldSchema = z.object({
  // "choice": 2-3 ready-made replies, verbatim from the character turn's suggestedReplies.
  options: z.array(z.string()).optional(),
  // "tiles": shuffled known-word tiles (one suggested reply's words + known distractors).
  tileWords: z.array(z.string()).optional(),
  // "type": up to 3 rusty words to nudge into the conversation — a hint, never a lock.
  rustyWords: z.array(RustyWordHintSchema).optional(),
});
export type ReplyScaffold = z.infer<typeof ReplyScaffoldSchema>;

export const NextReplyPlanSchema = z.object({
  mode: NextReplyModeSchema,
  scaffold: ReplyScaffoldSchema.optional(),
});
export type NextReplyPlan = z.infer<typeof NextReplyPlanSchema>;

export const MessageSchema = z.object({
  id: z.string(),
  sender: MessageSenderSchema,
  text: z.string(),
  // English translation, shipped with character bubbles only — null hides the translate toggle.
  translation: z.string().nullable(),
  // Tappable-word data. Null on every "user" bubble (the user wrote it — nothing to resolve) and
  // on any "character" bubble that failed to tokenize for some reason; MessageBubble must degrade
  // to plain text rather than crash, same discipline as WordPopup's "no entry" branch.
  tokens: z.array(StoryTokenSchema).nullable(),
  glossary: z.record(z.string(), StoryGlossaryEntrySchema).nullable(),
  mode: ReplyModeSchema,
  source: TurnSourceNameSchema.nullable(),
  // The plan for the NEXT user reply, as decided when THIS (character) message was created. Null
  // on every "user" bubble and on any character bubble predating iteration 2. Absent/null → the
  // slot renders "type" (see ReplySlot's contract) — additive and backward-compatible.
  nextReplyPlan: NextReplyPlanSchema.nullable(),
  createdAt: z.string(),
});
export type Message = z.infer<typeof MessageSchema>;

export const ConversationSchema = z.object({
  id: z.string(),
  characterId: z.string(),
  characterName: z.string(),
  lastMessageText: z.string().nullable(),
  lastMessageAt: z.string(),
  unreadCount: z.number().int().nonnegative(),
});
export type Conversation = z.infer<typeof ConversationSchema>;

export const ChatInboxResponseSchema = z.object({
  conversations: z.array(ConversationSchema),
});
export type ChatInboxResponse = z.infer<typeof ChatInboxResponseSchema>;

export const ChatThreadResponseSchema = z.object({
  conversationId: z.string(),
  characterName: z.string(),
  messages: z.array(MessageSchema),
  // Framed in the UI as healthy pacing, not a paywall — see CHAT_DAILY_TURN_LIMIT.
  turnsRemainingToday: z.number().int().nonnegative(),
});
export type ChatThreadResponse = z.infer<typeof ChatThreadResponseSchema>;

export const OpenConversationResponseSchema = z.object({
  conversationId: z.string(),
});
export type OpenConversationResponse = z.infer<typeof OpenConversationResponseSchema>;

// { text } only in iteration 1 — every ReplyMode ends by producing plain text (see ReplySlot's
// contract); `mode` defaults to "type" server-side when omitted.
export const ChatTurnRequestSchema = z.object({
  text: z.string().min(1).max(500),
  mode: ReplyModeSchema.optional(),
});
export type ChatTurnRequest = z.infer<typeof ChatTurnRequestSchema>;

export const ChatTurnResponseSchema = z.object({
  userMessage: MessageSchema,
  characterMessage: MessageSchema,
  turnsRemainingToday: z.number().int().nonnegative(),
});
export type ChatTurnResponse = z.infer<typeof ChatTurnResponseSchema>;

// ─── Story Chat contract (iteration 5: memory) ──────────────────────────────
//
// A small, capped, safe-by-construction record of what a character remembers about the user in
// ONE conversation — never the user's real identity (see the spec's deny list, enforced in
// packages/ai/src/chat/memory-safety.ts). Fed into the turn's system prompt alongside a bounded
// recent-message window instead of the whole thread; see chat.service.ts's postTurn.

export const CHAT_MEMORY_MAX_FACTS = 8;

export const MemoryFactSchema = z.object({
  text: z.string(),
  addedAt: z.string(),
});
export type MemoryFact = z.infer<typeof MemoryFactSchema>;

// What run-chat-turn.ts/persona-prompt.ts need to fold a note into a turn's system prompt — no
// conversationId/updatedAt bookkeeping, just the content. Null (not this shape) when there's no
// note yet, memory is disabled, or the user cleared it via "Forget this".
export const ConversationMemorySchema = z.object({
  summary: z.string(),
  facts: z.array(MemoryFactSchema),
});
export type ConversationMemory = z.infer<typeof ConversationMemorySchema>;

// GET /chat/conversations/:id/memory — "What [name] remembers about you". Always returns a
// (possibly empty) shape rather than 404ing when no note exists yet, so the UI can render "Tom
// doesn't remember anything yet" the same way it renders a real-but-empty note.
export const MemoryNoteResponseSchema = z.object({
  characterName: z.string(),
  summary: z.string(),
  facts: z.array(MemoryFactSchema),
  updatedAt: z.string().nullable(),
});
export type MemoryNoteResponse = z.infer<typeof MemoryNoteResponseSchema>;

// DELETE /chat/conversations/:id/memory — "Forget this". The real Message history is untouched;
// only the note (summary + facts + lastMessageId) is cleared, so the next nightly run rebuilds it
// from scratch off the conversation's full history.
export const ForgetMemoryResponseSchema = z.object({ ok: z.literal(true) });
export type ForgetMemoryResponse = z.infer<typeof ForgetMemoryResponseSchema>;
