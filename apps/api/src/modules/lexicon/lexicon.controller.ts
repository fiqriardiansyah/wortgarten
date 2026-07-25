import { Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { Session, UserSession } from '@thallesp/nestjs-better-auth';
import { AnalyzeRequestSchema, AnalyzeResponseSchema, LexiconSearchResponseSchema, SenseDetailResponseSchema } from '@wortgarten/shared';
import { parseOrBadRequest } from '../../lib/zod-parse';
import { AnalyzeService } from './analyze.service';
import { SearchService } from './search.service';

@Controller('lexicon')
export class LexiconController {
  constructor(
    private readonly searchService: SearchService,
    private readonly analyzeService: AnalyzeService,
  ) {}

  @Get('search')
  async search(@Query('q') q: string | undefined, @Session() session: UserSession) {
    const results = await this.searchService.search(q ?? '', session.user.id);
    return LexiconSearchResponseSchema.parse({ results });
  }

  @Get('sense/:senseId')
  async getSense(@Param('senseId') senseId: string) {
    const result = await this.searchService.getSenseDetail(senseId);
    if (!result) throw new NotFoundException('Sense not found');
    return SenseDetailResponseSchema.parse(result);
  }

  @Post('analyze')
  async analyze(@Body() body: unknown, @Session() session: UserSession) {
    const input = parseOrBadRequest(AnalyzeRequestSchema, body);
    const result = await this.analyzeService.analyze(input.text, session.user.id);
    return AnalyzeResponseSchema.parse(result);
  }
}
