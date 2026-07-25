import { Module } from '@nestjs/common';
import { WordsModule } from '../modules/words/words.module';
import { StoriesModule } from '../stories/stories.module';
import { WorldsController } from './worlds.controller';
import { WorldsService } from './worlds.service';

@Module({
  imports: [WordsModule, StoriesModule],
  controllers: [WorldsController],
  providers: [WorldsService],
  exports: [WorldsService],
})
export class WorldsModule {}
