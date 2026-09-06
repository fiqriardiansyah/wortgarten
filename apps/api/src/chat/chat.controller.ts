import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { Session, UserSession } from '@thallesp/nestjs-better-auth';
import { ChatTurnRequestSchema, OpenConversationResponseSchema } from '@wortgarten/shared';
import { parseOrBadRequest } from '../lib/zod-parse';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('conversations')
  listConversations(@Session() session: UserSession) {
    return this.chatService.listInbox(session.user.id);
  }

  /** Backs both the pinned default host (no story) and the "💬 Talk to [name]" button (a
   * story's character) — get-or-create either way, per Seam-agnostic design: the frontend never
   * needs to know which case it is. */
  @Post('characters/:characterId/open')
  async openConversation(@Session() session: UserSession, @Param('characterId') characterId: string) {
    const conversation = await this.chatService.getOrCreateConversationForCharacter(session.user.id, characterId);
    return OpenConversationResponseSchema.parse({ conversationId: conversation.id });
  }

  @Get('conversations/:id/messages')
  getThread(@Session() session: UserSession, @Param('id') id: string) {
    return this.chatService.getThread(session.user.id, id);
  }

  @Post(':conversationId/turn')
  async postTurn(@Session() session: UserSession, @Param('conversationId') conversationId: string, @Body() body: unknown) {
    const input = parseOrBadRequest(ChatTurnRequestSchema, body);
    return this.chatService.postTurn(session.user.id, conversationId, input.text, input.mode);
  }

  /** Iteration 5 (memory): "What [name] remembers about you". */
  @Get('conversations/:id/memory')
  getMemory(@Session() session: UserSession, @Param('id') id: string) {
    return this.chatService.getMemoryNote(session.user.id, id);
  }

  /** Iteration 5 (memory): "Forget this" — clears the note; the real message history is untouched. */
  @Delete('conversations/:id/memory')
  forgetMemory(@Session() session: UserSession, @Param('id') id: string) {
    return this.chatService.forgetMemory(session.user.id, id);
  }
}
