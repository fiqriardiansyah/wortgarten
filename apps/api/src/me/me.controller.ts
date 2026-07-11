import { Controller, Get } from '@nestjs/common';
import { Session, UserSession } from '@thallesp/nestjs-better-auth';
import { MeResponse } from '@wortgarten/shared';

@Controller('me')
export class MeController {
  @Get()
  getMe(@Session() session: UserSession): MeResponse {
    return {
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        image: session.user.image ?? null,
      },
    };
  }
}
