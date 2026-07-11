import { Module } from '@nestjs/common';
import { WordsModule } from '../modules/words/words.module';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';

@Module({
  imports: [WordsModule],
  controllers: [HomeController],
  providers: [HomeService],
})
export class HomeModule {}
