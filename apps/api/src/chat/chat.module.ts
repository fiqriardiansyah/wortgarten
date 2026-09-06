import { Module } from '@nestjs/common';
import { AiModule } from '@wortgarten/ai';
import { SrsModule } from '../modules/srs/srs.module';
import { WordsModule } from '../modules/words/words.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  // WordsModule/SrsModule: the memory payoff (iteration 2) grades a rusty word passively when
  // it shows up in a sent reply — needs WordsService.findRusty and SrsService.applyPassiveReview.
  imports: [AiModule, WordsModule, SrsModule],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
