import { describe, expect, it } from 'vitest';
import type { AiJob, AiProvider } from '@wortgarten/shared';
import { AiService } from './ai.service';
import type { AiRouterPort } from './ai-router';
import { FakeAdapter } from './adapters/fake.adapter';

const job: AiJob = {
  type: 'SANITY_SENTENCE',
  allowedWords: ['der', 'Hund', 'läuft', 'schnell'],
  maxWords: 8,
};

const GOOD = { sentence: 'Der Hund läuft schnell.' };
const BAD_JSON = 'not json at all';
const DISALLOWED = { sentence: 'Der Hund fliegt schnell.' }; // "fliegt" not on the allowlist

class FakeRouter implements AiRouterPort {
  recordCalls = 0;
  constructor(private readonly provider: AiProvider) {}
  async decide(): Promise<AiProvider> {
    return this.provider;
  }
  async recordGroqSuccess(): Promise<void> {
    this.recordCalls += 1;
  }
}

describe('AiService.run', () => {
  it('returns ok:true with the routed provider on a good first attempt', async () => {
    const router = new FakeRouter('GROQ');
    const groq = new FakeAdapter('GROQ', [GOOD]);
    const ollama = new FakeAdapter('OLLAMA', [GOOD]);
    const service = new AiService(router, groq, ollama, 2);

    const result = await service.run(job);

    expect(result).toEqual({ ok: true, value: GOOD, provider: 'GROQ' });
    expect(groq.calls).toBe(1);
    expect(ollama.calls).toBe(0);
    expect(router.recordCalls).toBe(1);
  });

  it('routes to OLLAMA when the router says so, and does not touch GROQ at all', async () => {
    const router = new FakeRouter('OLLAMA');
    const groq = new FakeAdapter('GROQ', [GOOD]);
    const ollama = new FakeAdapter('OLLAMA', [GOOD]);
    const service = new AiService(router, groq, ollama, 2);

    const result = await service.run(job);

    expect(result).toMatchObject({ ok: true, provider: 'OLLAMA' });
    expect(groq.calls).toBe(0);
    expect(ollama.calls).toBe(1);
    expect(router.recordCalls).toBe(0); // only GROQ success increments quota
  });

  it('retries the same provider on a checker failure before giving up on it', async () => {
    const router = new FakeRouter('GROQ');
    const groq = new FakeAdapter('GROQ', [BAD_JSON, GOOD]);
    const ollama = new FakeAdapter('OLLAMA', [GOOD]);
    const service = new AiService(router, groq, ollama, 2);

    const result = await service.run(job);

    expect(result).toEqual({ ok: true, value: GOOD, provider: 'GROQ' });
    expect(groq.calls).toBe(2);
    expect(ollama.calls).toBe(0);
  });

  it('falls back to the other brain once the same provider exhausts its retries', async () => {
    const router = new FakeRouter('GROQ');
    // maxRetries=1 → 2 total GROQ attempts, both bad, then one OLLAMA attempt.
    const groq = new FakeAdapter('GROQ', [BAD_JSON, DISALLOWED]);
    const ollama = new FakeAdapter('OLLAMA', [GOOD]);
    const service = new AiService(router, groq, ollama, 1);

    const result = await service.run(job);

    expect(result).toEqual({ ok: true, value: GOOD, provider: 'OLLAMA' });
    expect(groq.calls).toBe(2);
    expect(ollama.calls).toBe(1);
  });

  it('returns ok:false — never throws — when both providers are exhausted', async () => {
    const router = new FakeRouter('GROQ');
    const groq = new FakeAdapter('GROQ', [BAD_JSON]);
    const ollama = new FakeAdapter('OLLAMA', [DISALLOWED]);
    const service = new AiService(router, groq, ollama, 0);

    // If run() threw, this await would reject and fail the test — that IS the "never throws" check.
    const verdict = await service.run(job);

    expect(verdict.ok).toBe(false);
    expect(router.recordCalls).toBe(0);
  });

  it('never throws even if an adapter itself throws', async () => {
    const router = new FakeRouter('GROQ');
    const throwingAdapter = { generate: () => Promise.reject(new Error('network is on fire')) };
    const ollama = new FakeAdapter('OLLAMA', [GOOD]);
    const service = new AiService(router, throwingAdapter, ollama, 0);

    const result = await service.run(job);

    expect(result).toMatchObject({ ok: true, provider: 'OLLAMA' });
  });

  describe('remoteOnly (daytime lazy generation guardrail)', () => {
    it('skips outright — never touching either adapter — when the router says quota is exhausted', async () => {
      const router = new FakeRouter('OLLAMA'); // quota exhausted, router would normally route here
      const groq = new FakeAdapter('GROQ', [GOOD]);
      const ollama = new FakeAdapter('OLLAMA', [GOOD]);
      const service = new AiService(router, groq, ollama, 2);

      const result = await service.run(job, { remoteOnly: true });

      expect(result).toEqual({ ok: false, reason: 'REMOTE_QUOTA_EXHAUSTED', detail: expect.any(String) });
      expect(groq.calls).toBe(0);
      expect(ollama.calls).toBe(0); // the local model must never load during a remote-only run
    });

    it('uses GROQ normally while quota remains', async () => {
      const router = new FakeRouter('GROQ');
      const groq = new FakeAdapter('GROQ', [GOOD]);
      const ollama = new FakeAdapter('OLLAMA', [GOOD]);
      const service = new AiService(router, groq, ollama, 2);

      const result = await service.run(job, { remoteOnly: true });

      expect(result).toEqual({ ok: true, value: GOOD, provider: 'GROQ' });
      expect(ollama.calls).toBe(0);
    });

    it('gives up instead of falling back to OLLAMA once GROQ exhausts its retries', async () => {
      const router = new FakeRouter('GROQ');
      const groq = new FakeAdapter('GROQ', [BAD_JSON, BAD_JSON]);
      const ollama = new FakeAdapter('OLLAMA', [GOOD]);
      const service = new AiService(router, groq, ollama, 1); // 2 total GROQ attempts, both bad

      const result = await service.run(job, { remoteOnly: true });

      expect(result).toEqual({ ok: false, reason: 'REMOTE_QUOTA_EXHAUSTED', detail: expect.any(String) });
      expect(groq.calls).toBe(2);
      expect(ollama.calls).toBe(0);
    });
  });
});
