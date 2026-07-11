import { Module } from '@nestjs/common';
import { LookupService } from './lookup.service';

@Module({
  providers: [LookupService],
  exports: [LookupService],
})
export class LexiconModule {}
