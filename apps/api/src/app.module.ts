import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { resolve } from 'path';
import { createAuth } from './lib/auth';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { HomeModule } from './home/home.module';
import { LexiconModule } from './modules/lexicon/lexicon.module';
import { MeModule } from './me/me.module';
import { ProgressModule } from './progress/progress.module';
import { SessionModule } from './modules/session/session.module';
import { StoriesModule } from './stories/stories.module';
import { WordsModule } from './modules/words/words.module';
import { WorldsModule } from './worlds/worlds.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: resolve(__dirname, '../../../../.env'),
    }),
    AuthModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        auth: createAuth(configService),
      }),
    }),
    PrismaModule,
    HealthModule,
    HomeModule,
    LexiconModule,
    MeModule,
    ProgressModule,
    SessionModule,
    StoriesModule,
    WordsModule,
    WorldsModule,
  ],
})
export class AppModule {}
