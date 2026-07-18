import { Module } from '@nestjs/common';
import { AiModule } from '@wortgarten/ai';
import { WordsModule } from '../modules/words/words.module';
import { StoriesController } from './stories.controller';
import { StoriesService } from './stories.service';

@Module({
  imports: [AiModule, WordsModule],
  controllers: [StoriesController],
  providers: [StoriesService],
  exports: [StoriesService],
})
export class StoriesModule {}
