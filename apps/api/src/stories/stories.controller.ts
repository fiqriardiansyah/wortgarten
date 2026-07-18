import { Controller, Get, Param } from '@nestjs/common';
import { Session, UserSession } from '@thallesp/nestjs-better-auth';
import { StoriesService } from './stories.service';

@Controller('stories')
export class StoriesController {
  constructor(private readonly storiesService: StoriesService) {}

  @Get()
  list(@Session() session: UserSession) {
    return this.storiesService.listForUser(session.user.id);
  }

  @Get(':id')
  getOne(@Session() session: UserSession, @Param('id') id: string) {
    return this.storiesService.getById(session.user.id, id);
  }
}
