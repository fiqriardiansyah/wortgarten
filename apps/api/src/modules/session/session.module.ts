import { Module } from '@nestjs/common';
import { LexiconModule } from '../lexicon/lexicon.module';
import { SrsModule } from '../srs/srs.module';
import { SessionBuilderService } from './session-builder.service';
import { SessionController } from './session.controller';
import { SessionGradingService } from './session-grading.service';
import { SessionService } from './session.service';

@Module({
  imports: [SrsModule, LexiconModule],
  controllers: [SessionController],
  providers: [SessionBuilderService, SessionGradingService, SessionService],
  exports: [SessionService, SessionBuilderService],
})
export class SessionModule {}
