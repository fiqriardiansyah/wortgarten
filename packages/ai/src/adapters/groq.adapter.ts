import { Injectable } from '@nestjs/common';
import Groq from 'groq-sdk';
import type { AiJob, AiRawResult } from '@wortgarten/shared';
import type { AiAdapter } from './ai-adapter.interface';
import { buildPrompt } from './prompts';
import { safeJsonParse } from './safe-json-parse';

const DEFAULT_MODEL = 'llama-3.1-8b-instant';
const TIMEOUT_MS = 8000; // the "fast" brain — fail fast rather than hang the router

/** The free-quota brain. Never leaks `GROQ_API_KEY` — it's only ever read from `process.env` and
 * handed to the `groq-sdk` client, never logged or included in the returned result. Never
 * throws: a failed/timed-out call still returns a valid `AiRawResult` so the checker (and the
 * retry/fallback policy in AiService) can handle it like any other bad output. `maxRetries: 0`
 * on the client — AiService already owns the retry policy; letting the SDK retry too would
 * silently multiply attempts against the per-attempt timeout budget.
 *
 * Reads `process.env` directly rather than injecting Nest's `ConfigService`: this package is
 * consumed by two apps pinned to different major versions of `@nestjs/common` (worker on v10,
 * api on v11), and pnpm gives each its own physically distinct `@nestjs/config` install — DI
 * token matching by class reference then fails across that boundary. The host app's own
 * `ConfigModule.forRoot()` already populates `process.env`, so reading it directly here is both
 * simpler and immune to that mismatch. */
@Injectable()
export class GroqAdapter implements AiAdapter {
  async generate(job: AiJob): Promise<AiRawResult> {
    const apiKey = process.env.GROQ_API_KEY;
    const model = process.env.GROQ_MODEL ?? DEFAULT_MODEL;
    const { system, user } = buildPrompt(job);

    const client = new Groq({ apiKey, timeout: TIMEOUT_MS, maxRetries: 0 });

    try {
      const completion = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.4,
        // SANITY_SENTENCE needs a handful of tokens; STORY's JSON carries a title, several
        // paragraphs (~job.maxWords German words) AND a full English translation of the same
        // length — 200 was already tight for STORY before the translation field existed.
        max_tokens: job.type === 'STORY' ? 900 : 200,
      });

      const text = completion.choices[0]?.message?.content ?? '';
      return { provider: 'GROQ', json: safeJsonParse(text), raw: text };
    } catch (err) {
      if (err instanceof Groq.APIError) {
        return { provider: 'GROQ', json: null, raw: `HTTP ${err.status}: ${err.message}` };
      }
      return { provider: 'GROQ', json: null, raw: `request failed: ${(err as Error).message}` };
    }
  }
}
