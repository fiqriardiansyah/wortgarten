import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Session, UserSession } from '@thallesp/nestjs-better-auth';
import {
  AddWordRequestSchema,
  AddWordResponseSchema,
  AddWordsBatchRequestSchema,
  AddWordsBatchResponseSchema,
  UpdateWordRequestSchema,
  WordDetailSchema,
  WordFilterSchema,
  WordsListResponseSchema,
} from '@wortgarten/shared';
import { parseOrBadRequest } from '../../lib/zod-parse';
import { WordsService } from './words.service';

@Controller('words')
export class WordsController {
  constructor(private readonly wordsService: WordsService) {}

  @Post()
  async addWord(@Body() body: unknown, @Session() session: UserSession) {
    const input = parseOrBadRequest(AddWordRequestSchema, body);
    const result = await this.wordsService.addWord(session.user.id, input);
    return AddWordResponseSchema.parse(result);
  }

  @Post('batch')
  async addWordsBatch(@Body() body: unknown, @Session() session: UserSession) {
    const input = parseOrBadRequest(AddWordsBatchRequestSchema, body);
    const added = await this.wordsService.addWordsBatch(session.user.id, input.items, input.sourceType);
    return AddWordsBatchResponseSchema.parse({ added });
  }

  @Get()
  async listWords(
    @Query('q') q: string | undefined,
    @Query('filter') filter: string | undefined,
    @Query('page') page: string | undefined,
    @Query('pageSize') pageSize: string | undefined,
    @Session() session: UserSession,
  ) {
    const result = await this.wordsService.listWords(session.user.id, {
      q,
      filter: filter ? parseOrBadRequest(WordFilterSchema, filter) : undefined,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
    return WordsListResponseSchema.parse(result);
  }

  @Get(':id')
  async getWord(@Param('id') id: string, @Session() session: UserSession) {
    const result = await this.wordsService.getWordDetail(session.user.id, id);
    return WordDetailSchema.parse(result);
  }

  @Patch(':id')
  async updateWord(@Param('id') id: string, @Body() body: unknown, @Session() session: UserSession) {
    const input = parseOrBadRequest(UpdateWordRequestSchema, body);
    return this.wordsService.updateWord(session.user.id, id, input);
  }

  @Delete(':id')
  async deleteWord(@Param('id') id: string, @Session() session: UserSession) {
    return this.wordsService.deleteWord(session.user.id, id);
  }
}
