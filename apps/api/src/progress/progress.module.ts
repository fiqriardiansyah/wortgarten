import { Module } from '@nestjs/common';
import { WordsModule } from '../modules/words/words.module';
import { StreakModule } from '../streak/streak.module';
import { ProgressController } from './progress.controller';
import { ProgressService } from './progress.service';

@Module({
  imports: [WordsModule, StreakModule],
  controllers: [ProgressController],
  providers: [ProgressService],
})
export class ProgressModule {}
