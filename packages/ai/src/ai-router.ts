import type { AiProvider } from '@wortgarten/shared';
import type { AiQuotaStore } from './quota/ai-quota.store';
import type { Clock } from './clock';

/** What AiService depends on — lets tests substitute a trivial fake router instead of wiring a
 * real AiRouter + fake store/clock when the router's own decision logic isn't what's under test. */
export interface AiRouterPort {
  decide(): Promise<AiProvider>;
  recordGroqSuccess(): Promise<void>;
}

/** Plain logic — no Nest decorators, constructed directly (in the module via a factory, in
 * tests via `new AiRouter(fakeStore, fakeClock)`), same style as this repo's other
 * unit-tested-by-direct-instantiation services. */
export class AiRouter implements AiRouterPort {
  constructor(
    private readonly quotaStore: AiQuotaStore,
    private readonly clock: Clock,
  ) {}

  /** GROQ while today's free quota remains, else OLLAMA. `SANITY_SENTENCE` always uses this
   * default rule; a future bulk job type (e.g. overnight story generation) is where a
   * job-type hint routing straight to OLLAMA to preserve quota would plug in. */
  async decide(): Promise<AiProvider> {
    const usage = await this.quotaStore.getGroqUsage(this.clock.todayUtcDateKey());
    return usage.used < usage.limit ? 'GROQ' : 'OLLAMA';
  }

  async recordGroqSuccess(): Promise<void> {
    await this.quotaStore.recordGroqSuccess(this.clock.todayUtcDateKey());
  }
}
