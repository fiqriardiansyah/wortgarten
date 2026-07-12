import { Module } from '@nestjs/common';
import { SrsModule } from '../srs/srs.module';
import { WordsController } from './words.controller';
import { WordsService } from './words.service';

@Module({
  imports: [SrsModule],
  controllers: [WordsController],
  providers: [WordsService],
  exports: [WordsService],
})
export class WordsModule {}
