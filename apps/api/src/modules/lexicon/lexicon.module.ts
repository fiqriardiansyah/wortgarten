import { Module } from '@nestjs/common';
import { AnalyzeService } from './analyze.service';
import { LexiconController } from './lexicon.controller';
import { LookupService } from './lookup.service';
import { SearchService } from './search.service';

@Module({
  controllers: [LexiconController],
  providers: [LookupService, SearchService, AnalyzeService],
  exports: [LookupService, SearchService, AnalyzeService],
})
export class LexiconModule {}
