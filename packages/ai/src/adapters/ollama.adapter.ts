import { Injectable } from '@nestjs/common';
import type { AiJob, AiRawResult } from '@wortgarten/shared';
import type { AiAdapter } from './ai-adapter.interface';
import { buildPrompt } from './prompts';
import { safeJsonParse } from './safe-json-parse';

const DEFAULT_BASE_URL = 'http://localhost:11434';
const DEFAULT_MODEL = 'qwen2.5:3b-instruct-q4';
// keep_alive so the model stays resident only for the batch window that's actually calling
// it — each call in a batch refreshes this window, and it unloads on its own shortly after
// the batch ends. Never pass "-1" here: that would keep it resident all day on a 4GB box with
// no GPU, starving the API of RAM it needs during the day.
const DEFAULT_KEEP_ALIVE = '5m';
const TIMEOUT_MS = 30000; // the slow brain — 2 vCPU / no GPU, 3-8 tok/sec

/** The local, unmetered brain. Must not assume Ollama is warm — this service is built to run
 * from the worker (overnight), not the always-on API process. Never throws: a failed/timed-out
 * call still returns a valid `AiRawResult`.
 *
 * Reads `process.env` directly rather than injecting Nest's `ConfigService` — see the comment
 * on `GroqAdapter` for why (cross-Nest-major-version DI token identity mismatch between the
 * worker and api apps). */
@Injectable()
export class OllamaAdapter implements AiAdapter {
  async generate(job: AiJob): Promise<AiRawResult> {
    const baseUrl = process.env.OLLAMA_BASE_URL ?? DEFAULT_BASE_URL;
    const model = process.env.OLLAMA_MODEL ?? DEFAULT_MODEL;
    const keepAlive = process.env.OLLAMA_KEEP_ALIVE ?? DEFAULT_KEEP_ALIVE;
    const { system, user } = buildPrompt(job);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt: `${system}\n\n${user}`,
          format: 'json',
          stream: false,
          keep_alive: keepAlive,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        return { provider: 'OLLAMA', json: null, raw: `HTTP ${res.status}: ${body}` };
      }

      const body = (await res.json()) as { response?: string };
      const text = body.response ?? '';
      return { provider: 'OLLAMA', json: safeJsonParse(text), raw: text };
    } catch (err) {
      return { provider: 'OLLAMA', json: null, raw: `request failed: ${(err as Error).message}` };
    } finally {
      clearTimeout(timeout);
    }
  }
}
