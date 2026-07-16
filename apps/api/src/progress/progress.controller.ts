import { Controller, Get, Headers } from '@nestjs/common';
import { Session, UserSession } from '@thallesp/nestjs-better-auth';
import { ProgressService } from './progress.service';

@Controller('progress')
export class ProgressController {
  constructor(private readonly progressService: ProgressService) {}

  @Get()
  getDashboard(@Session() session: UserSession, @Headers('x-timezone') timezone?: string) {
    return this.progressService.getDashboard(session.user.id, timezone);
  }
}
