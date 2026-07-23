import { Module } from '@nestjs/common';
import { AiModule } from '@wortgarten/ai';
import { AudioModule } from '@wortgarten/audio';
import { ImagesModule } from '@wortgarten/images';
import { WordsModule } from '../modules/words/words.module';
import { StoriesController } from './stories.controller';
import { StoriesService } from './stories.service';

@Module({
  imports: [AiModule, ImagesModule, AudioModule, WordsModule],
  controllers: [StoriesController],
  providers: [StoriesService],
  exports: [StoriesService],
})
export class StoriesModule {}
