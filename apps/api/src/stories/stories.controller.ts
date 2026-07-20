import { Controller, Get, Param, Post } from '@nestjs/common';
import { Session, UserSession } from '@thallesp/nestjs-better-auth';
import { StoriesService } from './stories.service';

@Controller('stories')
export class StoriesController {
  constructor(private readonly storiesService: StoriesService) {}

  @Get()
  list(@Session() session: UserSession) {
    return this.storiesService.listForUser(session.user.id);
  }

  /** Dev-only manual trigger for the "Generate story" button in the Read page top bar — see
   * StoriesService.forceGenerateForDev for the production guard. */
  @Post('generate')
  forceGenerate(@Session() session: UserSession) {
    return this.storiesService.forceGenerateForDev(session.user.id);
  }

  @Get(':id')
  getOne(@Session() session: UserSession, @Param('id') id: string) {
    return this.storiesService.getById(session.user.id, id);
  }
}
