import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AiService, LexemeResolver, pickNextReplyPlan, runChatTurn, selectChatVocabulary, tokenizeAgainstAllowlist } from '@wortgarten/ai';
import type { ChatMemoryInput, ChatVocabulary } from '@wortgarten/ai';
import type { Prisma, Message as MessageRow } from '@wortgarten/database';
import {
  ChatInboxResponseSchema,
  ChatThreadResponseSchema,
  ChatTurnResponseSchema,
  displayForm,
  ForgetMemoryResponseSchema,
  isValidTimeZone,
  localDateKey,
  localDayRange,
  MemoryNoteResponseSchema,
} from '@wortgarten/shared';
import type {
  ChatInboxResponse,
  ChatThreadResponse,
  ChatTurnResponse,
  Conversation as ConversationRow,
  ForgetMemoryResponse,
  MemoryFact,
  MemoryNoteResponse,
  Message,
  NextReplyMode,
  NextReplyPlan,
  ReplyMode,
} from '@wortgarten/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SrsService } from '../modules/srs/srs.service';
import { RUSTY_THRESHOLD, WordsService } from '../modules/words/words.service';

// Framed in the UI as healthy pacing ("N messages left today"), never a paywall — see the
// Story Chat spec's "Feature flag & limits" section.
const CHAT_DAILY_TURN_LIMIT = 40;
// Stable, deterministic id (not @default(cuid())) so this single global row is idempotent to
// upsert — the pinned default host must exist before the user has read a single story.
const DEFAULT_HOST_ID = 'char_default_host';
// Enough for the model to follow the thread without an unbounded prompt. Iteration 5 (memory)
// makes this cap formal: everything older than this window lives in the MemoryNote's summary
// instead, so prompt size/cost stays flat regardless of how long the conversation runs overall.
const HISTORY_MESSAGE_LIMIT = 16;

function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    sender: row.sender as Message['sender'],
    text: row.text,
    translation: row.translation,
    tokens: (row.tokensJson as unknown as Message['tokens']) ?? null,
    glossary: (row.glossary as unknown as Message['glossary']) ?? null,
    mode: row.mode as Message['mode'],
    source: row.source as Message['source'],
    nextReplyPlan: (row.nextReplyPlanJson as unknown as NextReplyPlan | null) ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** CHAT_REPLY_VARIETY off (or unset) means always "type" — byte-for-byte iteration 1. Default-on
 * once iteration 1 is stable, per the iteration 2 spec's feature-flag section. */
function isChatReplyVarietyEnabled(): boolean {
  return process.env.CHAT_REPLY_VARIETY !== 'false';
}

/** CHAT_MEMORY_ENABLED off means no MemoryNote is ever read or written, and the turn's system
 * prompt gets no memory line at all — the recent-bubble window still applies (see
 * HISTORY_MESSAGE_LIMIT), so even "off" keeps the compaction benefit. Default on. */
function isChatMemoryEnabled(): boolean {
  return process.env.CHAT_MEMORY_ENABLED !== 'false';
}

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly words: WordsService,
    private readonly srs: SrsService,
  ) {}

  private resolver(): LexemeResolver {
    return new LexemeResolver(this.prisma);
  }

  /** Idempotent — a stable id means every call race-safely converges on the same single row. */
  private async ensureDefaultHost() {
    return this.prisma.character.upsert({
      where: { id: DEFAULT_HOST_ID },
      create: {
        id: DEFAULT_HOST_ID,
        storyId: null,
        name: 'Tom',
        role: 'a friendly garden guide',
        personaLine: 'Warm, encouraging, and endlessly curious about everyday life in Germany.',
        archetype: 'friendly_host',
        levelCapJson: {},
      },
      update: {},
    });
  }

  async getOrCreateDefaultHostConversation(userId: string): Promise<ConversationRow> {
    const host = await this.ensureDefaultHost();
    return this.getOrCreateConversation(userId, host.id);
  }

  async getOrCreateConversationForCharacter(userId: string, characterId: string): Promise<ConversationRow> {
    const character = await this.prisma.character.findUnique({ where: { id: characterId } });
    if (!character) throw new NotFoundException('Character not found');
    return this.getOrCreateConversation(userId, characterId);
  }

  private async getOrCreateConversation(userId: string, characterId: string): Promise<ConversationRow> {
    const existing = await this.prisma.conversation.findUnique({
      where: { userId_characterId: { userId, characterId } },
      include: { character: true },
    });
    if (existing) {
      return { id: existing.id, characterId, characterName: existing.character.name, lastMessageText: null, lastMessageAt: existing.lastMessageAt.toISOString(), unreadCount: existing.unreadCount };
    }

    const character = await this.prisma.character.findUniqueOrThrow({ where: { id: characterId } });
    const conversation = await this.prisma.conversation.create({
      data: { userId, characterId, lastMessageAt: new Date(), unreadCount: 1 },
    });

    // Opening line — routed through the same scripted TurnSource path (allowGroq: false) so a
    // freshly-opened chat is instant and never depends on Groq being reachable.
    const opening = await runChatTurn(this.prisma, this.aiService, this.resolver(), {
      userId,
      persona: character,
      storyTitle: null,
      history: [],
      userText: '',
      allowGroq: false,
    });

    // turnIndex 0, lastMode null — the opening message is always the very first plan a
    // conversation ever sees, which the director's own rules keep off "tiles" (see reply-director.ts).
    const nextReplyPlan = await this.buildNextReplyPlan(userId, opening.suggestedReplies, { turnIndex: 0, lastMode: null });

    const message = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        sender: 'character',
        text: opening.text,
        translation: opening.translation,
        tokensJson: opening.tokens as unknown as Prisma.InputJsonValue,
        glossary: opening.glossary as unknown as Prisma.InputJsonValue,
        source: opening.source,
        nextReplyPlanJson: nextReplyPlan as unknown as Prisma.InputJsonValue,
      },
    });
    await this.prisma.deliveryEvent.create({ data: { userId, conversationId: conversation.id, messageId: message.id } });

    return { id: conversation.id, characterId, characterName: character.name, lastMessageText: message.text, lastMessageAt: message.createdAt.toISOString(), unreadCount: 1 };
  }

  async listInbox(userId: string): Promise<ChatInboxResponse> {
    await this.getOrCreateDefaultHostConversation(userId);

    const rows = await this.prisma.conversation.findMany({
      where: { userId },
      include: { character: true, messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
      orderBy: { lastMessageAt: 'desc' },
    });

    const conversations = rows.map((row) => ({
      id: row.id,
      characterId: row.characterId,
      characterName: row.character.name,
      lastMessageText: row.messages[0]?.text ?? null,
      lastMessageAt: row.lastMessageAt.toISOString(),
      unreadCount: row.unreadCount,
    }));

    return ChatInboxResponseSchema.parse({ conversations });
  }

  async getThread(userId: string, conversationId: string): Promise<ChatThreadResponse> {
    const conversation = await this.prisma.conversation.findUnique({ where: { id: conversationId }, include: { character: true } });
    if (!conversation || conversation.userId !== userId) {
      throw new NotFoundException('Conversation not found');
    }

    const rows = await this.prisma.message.findMany({ where: { conversationId }, orderBy: { createdAt: 'asc' } });

    await this.prisma.$transaction([
      this.prisma.deliveryEvent.updateMany({ where: { conversationId, deliveredInApp: false }, data: { deliveredInApp: true } }),
      this.prisma.conversation.update({ where: { id: conversationId }, data: { unreadCount: 0 } }),
    ]);

    return ChatThreadResponseSchema.parse({
      conversationId,
      characterName: conversation.character.name,
      messages: rows.map(toMessage),
      turnsRemainingToday: await this.turnsRemainingToday(userId),
    });
  }

  async postTurn(userId: string, conversationId: string, text: string, mode: ReplyMode = 'type'): Promise<ChatTurnResponse> {
    const conversation = await this.prisma.conversation.findUnique({ where: { id: conversationId }, include: { character: true } });
    if (!conversation || conversation.userId !== userId) {
      throw new NotFoundException('Conversation not found');
    }

    if ((await this.turnsRemainingToday(userId)) <= 0) {
      throw new ForbiddenException("You've reached today's chat limit — come back tomorrow!");
    }

    const userMessageRow = await this.prisma.message.create({ data: { conversationId, sender: 'user', text, mode } });

    // The memory payoff (iteration 2): whatever mode produced `text` (typed, tapped a choice
    // chip, or assembled from tiles), a rusty word it contains gets graded as a real FSRS review
    // right here — before the character even replies, and before rustiness is re-read for the
    // NEXT plan below. Gated behind the same flag as the director itself: CHAT_REPLY_VARIETY off
    // must mean byte-for-byte iteration 1, and iteration 1 never touched FSRS state from chat text.
    const varietyEnabled = isChatReplyVarietyEnabled();
    let vocab: ChatVocabulary | undefined;
    if (varietyEnabled) {
      vocab = await selectChatVocabulary(this.prisma, userId);
      await this.gradeRustyWordsUsed(userId, text, vocab);
    }

    const priorPlanState = await this.priorPlanState(conversationId);
    const history = await this.recentHistory(conversationId);
    const memoryNote = isChatMemoryEnabled() ? await this.getConversationMemory(conversationId) : null;
    const character = conversation.character;
    const storyTitle = character.storyId
      ? ((await this.prisma.story.findUnique({ where: { id: character.storyId }, select: { title: true } }))?.title ?? null)
      : null;

    const result = await runChatTurn(this.prisma, this.aiService, this.resolver(), {
      userId,
      persona: character,
      storyTitle,
      history,
      userText: text,
      allowGroq: process.env.STORY_CHAT_ENABLED === 'true',
      memoryNote,
    });

    const nextReplyPlan = await this.buildNextReplyPlan(userId, result.suggestedReplies, priorPlanState, vocab);

    const characterMessageRow = await this.prisma.message.create({
      data: {
        conversationId,
        sender: 'character',
        text: result.text,
        translation: result.translation,
        tokensJson: result.tokens as unknown as Prisma.InputJsonValue,
        glossary: result.glossary as unknown as Prisma.InputJsonValue,
        source: result.source,
        nextReplyPlanJson: nextReplyPlan as unknown as Prisma.InputJsonValue,
      },
    });

    await this.prisma.$transaction([
      this.prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: characterMessageRow.createdAt, unreadCount: { increment: 1 } } }),
      this.prisma.deliveryEvent.create({ data: { userId, conversationId, messageId: characterMessageRow.id } }),
    ]);

    return ChatTurnResponseSchema.parse({
      userMessage: toMessage(userMessageRow),
      characterMessage: toMessage(characterMessageRow),
      turnsRemainingToday: await this.turnsRemainingToday(userId),
    });
  }

  /** Iteration 5 (memory): what run-chat-turn.ts folds into the system prompt. Null — not an
   * empty-but-present shape — whenever there's no note yet, so buildChatSystemPrompt's memoryLine
   * omits the paragraph entirely rather than rendering an empty one. */
  private async getConversationMemory(conversationId: string): Promise<ChatMemoryInput | null> {
    const note = await this.prisma.memoryNote.findUnique({ where: { conversationId } });
    if (!note) return null;
    const facts = (note.factsJson as unknown as MemoryFact[]) ?? [];
    if (!note.summary && facts.length === 0) return null;
    return { summary: note.summary, facts: facts.map((f) => f.text) };
  }

  /** "What [name] remembers about you" — always a well-formed (possibly empty) shape rather than
   * 404ing when no note has been written yet, so the UI can render "doesn't remember anything
   * yet" the same way it renders a real-but-empty note. */
  async getMemoryNote(userId: string, conversationId: string): Promise<MemoryNoteResponse> {
    const conversation = await this.prisma.conversation.findUnique({ where: { id: conversationId }, include: { character: true } });
    if (!conversation || conversation.userId !== userId) {
      throw new NotFoundException('Conversation not found');
    }

    const note = await this.prisma.memoryNote.findUnique({ where: { conversationId } });
    const facts = (note?.factsJson as unknown as MemoryFact[]) ?? [];

    return MemoryNoteResponseSchema.parse({
      characterName: conversation.character.name,
      summary: note?.summary ?? '',
      facts,
      updatedAt: note?.updatedAt.toISOString() ?? null,
    });
  }

  /** "Forget this" — clears the note (summary + facts + lastMessageId) so the next nightly run
   * rebuilds it from the conversation's full history. The real Message rows are never touched. */
  async forgetMemory(userId: string, conversationId: string): Promise<ForgetMemoryResponse> {
    const conversation = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation || conversation.userId !== userId) {
      throw new NotFoundException('Conversation not found');
    }

    await this.prisma.memoryNote.deleteMany({ where: { conversationId } });
    return ForgetMemoryResponseSchema.parse({ ok: true });
  }

  private async recentHistory(conversationId: string): Promise<{ role: 'user' | 'character'; text: string }[]> {
    const rows = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_MESSAGE_LIMIT,
    });
    return rows.reverse().map((r) => ({ role: r.sender as 'user' | 'character', text: r.text }));
  }

  /** What the reply director (packages/ai's pickNextReplyPlan) needs to know about the turn that
   * just happened — the mode it offered (to enforce "never the same non-type mode twice in a
   * row") and how many turns deep this conversation is (to drive the rotation). */
  private async priorPlanState(conversationId: string): Promise<{ turnIndex: number; lastMode: NextReplyMode | null }> {
    const [turnIndex, last] = await Promise.all([
      this.prisma.message.count({ where: { conversationId, sender: 'character' } }),
      this.prisma.message.findFirst({
        where: { conversationId, sender: 'character' },
        orderBy: { createdAt: 'desc' },
        select: { nextReplyPlanJson: true },
      }),
    ]);
    return { turnIndex, lastMode: (last?.nextReplyPlanJson as unknown as NextReplyPlan | null)?.mode ?? null };
  }

  private async buildNextReplyPlan(
    userId: string,
    suggestedReplies: string[],
    prior: { turnIndex: number; lastMode: NextReplyMode | null },
    vocab?: ChatVocabulary,
  ): Promise<NextReplyPlan> {
    const [rusty, resolvedVocab] = await Promise.all([this.words.findRusty(userId, RUSTY_THRESHOLD), vocab ?? selectChatVocabulary(this.prisma, userId)]);
    const rustyWords = rusty.map((r) => ({
      lexemeId: r.userWord.sense.lexemeId,
      display: displayForm({ lemma: r.userWord.sense.lexeme.lemma, partOfSpeech: r.userWord.sense.lexeme.partOfSpeech, gender: r.userWord.sense.lexeme.gender }),
    }));
    return pickNextReplyPlan(
      {
        enabled: isChatReplyVarietyEnabled(),
        suggestedReplies,
        rustyWords,
        turnIndex: prior.turnIndex,
        lastMode: prior.lastMode,
      },
      resolvedVocab.allowlistDisplay,
    );
  }

  /** Grades every rusty word (by lexemeId) that appears anywhere in `text`, once each, as a
   * successful FSRS review — see SrsService.applyPassiveReview. Runs whether `text` was typed,
   * a tapped choice chip, or an assembled tiles sentence; the director never needs to know which,
   * since every ReplySlot renderer ends at the same plain-text `onSubmit`. */
  private async gradeRustyWordsUsed(userId: string, text: string, vocab: ChatVocabulary): Promise<void> {
    const rusty = await this.words.findRusty(userId, RUSTY_THRESHOLD);
    if (rusty.length === 0) return;

    const rustyByLexemeId = new Map(rusty.map((r) => [r.userWord.sense.lexemeId, r.userWord]));
    const resolved = await tokenizeAgainstAllowlist(this.resolver(), text, {
      allowlistIds: vocab.allowlistIds,
      knownSenseByLexeme: vocab.knownSenseByLexeme,
      statusFor: (lexemeId) => (vocab.knownLexemeIds.has(lexemeId) ? 'known' : 'function'),
    });

    const graded = new Set<string>();
    for (const token of resolved.tokens) {
      if (!token.lexemeId || graded.has(token.lexemeId)) continue;
      const userWord = rustyByLexemeId.get(token.lexemeId);
      if (!userWord) continue;
      graded.add(token.lexemeId);
      await this.srs.applyPassiveReview(userWord);
    }
  }

  /** Per-user, across every conversation — the cap is "healthy pacing for the day," not a
   * per-character allowance. Counts only `sender: "user"` rows, mirroring StreakService's own
   * timezone-aware day-boundary pattern (see localDateKey/localDayRange). */
  private async turnsRemainingToday(userId: string): Promise<number> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } });
    const timezone = isValidTimeZone(user.timezone) ? user.timezone : 'UTC';
    const { start, end } = localDayRange(localDateKey(new Date(), timezone), timezone);

    const usedToday = await this.prisma.message.count({
      where: { sender: 'user', conversation: { userId }, createdAt: { gte: start, lt: end } },
    });
    return Math.max(0, CHAT_DAILY_TURN_LIMIT - usedToday);
  }
}
