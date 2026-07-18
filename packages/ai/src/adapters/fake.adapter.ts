import type { AiJob, AiProvider, AiRawResult } from '@wortgarten/shared';
import type { AiAdapter } from './ai-adapter.interface';
import { safeJsonParse } from './safe-json-parse';

export type FakeResponse = string | Record<string, unknown>;

/** Returns canned, parametrized outputs — including deliberately-bad ones — so the whole spine
 * (router → adapter → checker → retry/fallback) can be exercised with no network. Responses are
 * consumed in order, one per `generate()` call; the last one repeats once the list is exhausted. */
export class FakeAdapter implements AiAdapter {
  private callCount = 0;

  constructor(
    private readonly provider: AiProvider,
    private readonly responses: FakeResponse[],
  ) {
    if (responses.length === 0) throw new Error('FakeAdapter needs at least one response');
  }

  get calls(): number {
    return this.callCount;
  }

  async generate(_job: AiJob): Promise<AiRawResult> {
    const next = this.responses[Math.min(this.callCount, this.responses.length - 1)];
    this.callCount += 1;

    const raw = typeof next === 'string' ? next : JSON.stringify(next);
    return { provider: this.provider, json: safeJsonParse(raw), raw };
  }
}
