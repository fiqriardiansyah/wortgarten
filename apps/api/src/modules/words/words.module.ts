import { Module } from '@nestjs/common';
import { SrsModule } from '../srs/srs.module';
import { WordsService } from './words.service';

@Module({
  imports: [SrsModule],
  providers: [WordsService],
  exports: [WordsService],
})
export class WordsModule {}
