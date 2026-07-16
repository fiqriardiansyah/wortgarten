import { Controller, Get, Headers } from '@nestjs/common';
import { Session, UserSession } from '@thallesp/nestjs-better-auth';
import { HomeService } from './home.service';

@Controller('home')
export class HomeController {
  constructor(private readonly homeService: HomeService) {}

  @Get()
  getDashboard(@Session() session: UserSession, @Headers('x-timezone') timezone?: string) {
    return this.homeService.getDashboard(session.user.id, timezone);
  }
}
