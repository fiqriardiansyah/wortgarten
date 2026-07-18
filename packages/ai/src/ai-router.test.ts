import { describe, expect, it } from 'vitest';
import { AiRouter } from './ai-router';
import type { AiQuotaSnapshot, AiQuotaStore } from './quota/ai-quota.store';
import type { Clock } from './clock';

class FakeClock implements Clock {
  constructor(private readonly dateKey: string) {}
  todayUtcDateKey(): string {
    return this.dateKey;
  }
}

class FakeQuotaStore implements AiQuotaStore {
  private usageByDate = new Map<string, AiQuotaSnapshot>();

  constructor(seed: Record<string, AiQuotaSnapshot>) {
    for (const [date, snapshot] of Object.entries(seed)) this.usageByDate.set(date, snapshot);
  }

  async getGroqUsage(dateKey: string): Promise<AiQuotaSnapshot> {
    return this.usageByDate.get(dateKey) ?? { used: 0, limit: 100 };
  }

  async recordGroqSuccess(dateKey: string): Promise<void> {
    const current = await this.getGroqUsage(dateKey);
    this.usageByDate.set(dateKey, { ...current, used: current.used + 1 });
  }
}

describe('AiRouter', () => {
  it('routes to GROQ while quota remains', async () => {
    const store = new FakeQuotaStore({ '2026-07-17': { used: 5, limit: 100 } });
    const router = new AiRouter(store, new FakeClock('2026-07-17'));

    await expect(router.decide()).resolves.toBe('GROQ');
  });

  it('routes to OLLAMA once quota is exhausted', async () => {
    const store = new FakeQuotaStore({ '2026-07-17': { used: 100, limit: 100 } });
    const router = new AiRouter(store, new FakeClock('2026-07-17'));

    await expect(router.decide()).resolves.toBe('OLLAMA');
  });

  it('a fresh day with no row yet defaults to under quota, so GROQ', async () => {
    const store = new FakeQuotaStore({});
    const router = new AiRouter(store, new FakeClock('2026-07-18'));

    await expect(router.decide()).resolves.toBe('GROQ');
  });

  it('recordGroqSuccess increments the store, and the router observes it on the next decide()', async () => {
    const store = new FakeQuotaStore({ '2026-07-17': { used: 99, limit: 100 } });
    const router = new AiRouter(store, new FakeClock('2026-07-17'));

    await expect(router.decide()).resolves.toBe('GROQ');
    await router.recordGroqSuccess();
    await expect(store.getGroqUsage('2026-07-17')).resolves.toEqual({ used: 100, limit: 100 });
    await expect(router.decide()).resolves.toBe('OLLAMA');
  });

  it('quota is scoped per UTC day — a different day is unaffected by another day\'s usage', async () => {
    const store = new FakeQuotaStore({ '2026-07-17': { used: 100, limit: 100 } });
    const router = new AiRouter(store, new FakeClock('2026-07-18'));

    await expect(router.decide()).resolves.toBe('GROQ');
  });
});
