import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { AiModule } from '@wortgarten/ai';
import { AudioModule } from '@wortgarten/audio';
import { ImagesModule } from '@wortgarten/images';

/** A fixed relative depth to the repo-root `.env` breaks depending on how this module is
 * loaded: `ts-node` runs straight from `src/` (one entry point — the `ai:sanity` script), while
 * `nest build` output preserves the `src/` prefix under `dist/` (another — `node dist/main`),
 * putting the compiled file one level deeper. Walking up to the workspace root marker instead
 * of hardcoding a level count works correctly for both. */
function findRepoRootEnvPath(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return join(dir, '.env');
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Could not locate repo root (pnpm-workspace.yaml) above ${startDir}`);
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: findRepoRootEnvPath(__dirname),
    }),
    AiModule,
    ImagesModule,
    AudioModule,
  ],
})
export class WorkerModule {}
