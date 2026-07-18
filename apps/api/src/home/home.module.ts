import { Module } from '@nestjs/common';
import { SessionModule } from '../modules/session/session.module';
import { WordsModule } from '../modules/words/words.module';
import { StreakModule } from '../streak/streak.module';
import { StoriesModule } from '../stories/stories.module';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';

@Module({
  imports: [WordsModule, SessionModule, StreakModule, StoriesModule],
  controllers: [HomeController],
  providers: [HomeService],
})
export class HomeModule {}
