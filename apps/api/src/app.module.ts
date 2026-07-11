import { Module } from '@nestjs/common';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { auth } from './lib/auth';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { HomeModule } from './home/home.module';
import { MeModule } from './me/me.module';

@Module({
  imports: [AuthModule.forRoot({ auth }), PrismaModule, HealthModule, HomeModule, MeModule],
})
export class AppModule {}
