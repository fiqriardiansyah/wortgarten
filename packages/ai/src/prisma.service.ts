import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@wortgarten/database';

/** Self-contained so `AiModule` has no dependency on either app's own PrismaService — apps/api
 * and apps/worker each get their own Prisma connection lifecycle, same as this repo's existing
 * per-app PrismaService (apps/api/src/prisma/prisma.service.ts). */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    try {
      await this.$connect();
    } catch (err) {
      console.warn('AiModule Prisma: DB connection failed:', (err as Error).message);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
