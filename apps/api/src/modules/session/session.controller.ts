import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { Session, UserSession } from '@thallesp/nestjs-better-auth';
import {
  CreateSessionResponseSchema,
  DrillSessionResponseSchema,
  PracticeSessionRequestSchema,
  SessionCompleteResponseSchema,
  SubmitAttemptRequestSchema,
  SubmitAttemptResponseSchema,
} from '@wortgarten/shared';
import { parseOrBadRequest } from '../../lib/zod-parse';
import { SessionService } from './session.service';

@Controller('sessions')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Post()
  async createOrResume(@Session() session: UserSession) {
    const result = await this.sessionService.createOrResume(session.user.id);
    return CreateSessionResponseSchema.parse(result);
  }

  @Get('active')
  async getActive(@Session() session: UserSession) {
    const result = await this.sessionService.getActive(session.user.id);
    if (!result) throw new NotFoundException('No active session');
    return DrillSessionResponseSchema.parse(result);
  }

  @Post('practice')
  async practice(@Body() body: unknown, @Session() session: UserSession) {
    const input = parseOrBadRequest(PracticeSessionRequestSchema, body);
    const result = await this.sessionService.practice(session.user.id, input);
    return CreateSessionResponseSchema.parse(result);
  }

  @Post(':id/attempts')
  async submitAttempt(@Param('id') id: string, @Body() body: unknown, @Session() session: UserSession) {
    const input = parseOrBadRequest(SubmitAttemptRequestSchema, body);
    const result = await this.sessionService.submitAttempt(session.user.id, id, input);
    return SubmitAttemptResponseSchema.parse(result);
  }

  @Post(':id/complete')
  async complete(@Param('id') id: string, @Session() session: UserSession) {
    const result = await this.sessionService.complete(session.user.id, id);
    return SessionCompleteResponseSchema.parse(result);
  }

  @Post(':id/abandon')
  async abandon(@Param('id') id: string, @Session() session: UserSession) {
    await this.sessionService.abandon(session.user.id, id);
    return { id };
  }
}
