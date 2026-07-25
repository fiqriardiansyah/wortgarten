import { Controller, Get, Param } from '@nestjs/common';
import { Session, UserSession } from '@thallesp/nestjs-better-auth';
import { MissingWorldWordsResponseSchema, WorldStoriesResponseSchema, WorldsResponseSchema } from '@wortgarten/shared';
import { StoriesService } from '../stories/stories.service';
import { WorldsService } from './worlds.service';

@Controller('worlds')
export class WorldsController {
  constructor(
    private readonly worldsService: WorldsService,
    private readonly storiesService: StoriesService,
  ) {}

  @Get()
  async getProgress(@Session() session: UserSession) {
    const worlds = await this.worldsService.getProgress(session.user.id);
    return WorldsResponseSchema.parse({ worlds });
  }

  @Get(':key/missing-words')
  async getMissingWords(@Session() session: UserSession, @Param('key') key: string) {
    const words = await this.worldsService.getMissingWords(session.user.id, key);
    return MissingWorldWordsResponseSchema.parse({ words });
  }

  @Get(':key/stories')
  async getStories(@Session() session: UserSession, @Param('key') key: string) {
    const stories = await this.storiesService.listForWorld(session.user.id, key);
    return WorldStoriesResponseSchema.parse({ stories });
  }
}
