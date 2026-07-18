import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { GroqAdapter } from './adapters/groq.adapter';
import { OllamaAdapter } from './adapters/ollama.adapter';
import { PrismaAiQuotaStore } from './quota/ai-quota.store';
import { SystemClock } from './clock';
import { AiRouter } from './ai-router';
import { AiService } from './ai.service';
import { LexemeResolver } from './story/lexeme-resolver';
import { makeStoryChecker } from './story/story-checker';
import { AI_QUOTA_STORE, CLOCK } from './tokens';

const DEFAULT_GROQ_DAILY_LIMIT = 10000;
const DEFAULT_MAX_RETRIES = 2;

/** The one door's Nest wiring. Import this into any app that needs `AiService` — assumes the
 * host app has already set up `ConfigModule.forRoot({ isGlobal: true })` (both apps/api and
 * apps/worker do), which populates `process.env`; AiModule reads env vars directly rather than
 * injecting `ConfigService` (see the comment on `GroqAdapter` — packages/ai is consumed by apps
 * pinned to different major versions of `@nestjs/common`, and pnpm's per-app `@nestjs/config`
 * install makes `ConfigService` an unreliable cross-package DI token here). Only Nest plumbing
 * lives here — the pure contracts and checker stay framework-free in `@wortgarten/shared`. */
@Module({
  providers: [
    PrismaService,
    GroqAdapter,
    OllamaAdapter,
    { provide: CLOCK, useClass: SystemClock },
    {
      provide: AI_QUOTA_STORE,
      useFactory: (prisma: PrismaService) =>
        new PrismaAiQuotaStore(prisma.aiQuota, Number(process.env.GROQ_DAILY_LIMIT ?? DEFAULT_GROQ_DAILY_LIMIT)),
      inject: [PrismaService],
    },
    {
      provide: AiRouter,
      useFactory: (store, clock) => new AiRouter(store, clock),
      inject: [AI_QUOTA_STORE, CLOCK],
    },
    {
      provide: AiService,
      useFactory: (router: AiRouter, groq: GroqAdapter, ollama: OllamaAdapter, prisma: PrismaService) =>
        new AiService(
          router,
          groq,
          ollama,
          Number(process.env.AI_MAX_RETRIES ?? DEFAULT_MAX_RETRIES),
          makeStoryChecker(new LexemeResolver(prisma)),
        ),
      inject: [AiRouter, GroqAdapter, OllamaAdapter, PrismaService],
    },
  ],
  exports: [AiService, PrismaService],
})
export class AiModule {}
