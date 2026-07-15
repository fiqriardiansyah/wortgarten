import { Module } from '@nestjs/common';
import { SessionModule } from '../modules/session/session.module';
import { WordsModule } from '../modules/words/words.module';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';

@Module({
  imports: [WordsModule, SessionModule],
  controllers: [HomeController],
  providers: [HomeService],
})
export class HomeModule {}
