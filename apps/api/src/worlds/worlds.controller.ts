import { Controller, Get, Param } from '@nestjs/common';
import { Session, UserSession } from '@thallesp/nestjs-better-auth';
import { MissingWorldWordsResponseSchema, WorldsResponseSchema } from '@wortgarten/shared';
import { WorldsService } from './worlds.service';

@Controller('worlds')
export class WorldsController {
  constructor(private readonly worldsService: WorldsService) {}

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
}
