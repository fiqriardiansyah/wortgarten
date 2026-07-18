import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AiService } from '@wortgarten/ai';
import type { AiJob } from '@wortgarten/shared';
import { WorkerModule } from '../worker.module';

// Boring on purpose — proves route → generate → check → retry/fallback without touching
// stories. The allowlist is plain code, chosen here, never by the model.
const ALLOWED_WORDS = ['der', 'Hund', 'läuft', 'schnell'];
const MAX_WORDS = 8;

async function main() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  const aiService = app.get(AiService);

  const job: AiJob = { type: 'SANITY_SENTENCE', allowedWords: ALLOWED_WORDS, maxWords: MAX_WORDS };
  console.log(`[ai:sanity] allowedWords=[${ALLOWED_WORDS.join(', ')}] maxWords=${MAX_WORDS}`);

  const result = await aiService.run(job);

  if (result.ok) {
    console.log(`[ai:sanity] PASS via ${result.provider}: "${(result.value as { sentence: string }).sentence}"`);
  } else {
    console.log(`[ai:sanity] FAIL (${result.reason}): ${result.detail}`);
  }

  await app.close();
  process.exit(result.ok ? 0 : 1);
}

main().catch((err) => {
  console.error('[ai:sanity] crashed:', err);
  process.exit(1);
});
