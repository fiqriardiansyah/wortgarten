import { checkSanitySentence } from '@wortgarten/shared';
import type { AiCheckedResult, AiJob, AiProvider, AiRawResult } from '@wortgarten/shared';
import type { AiAdapter } from './adapters/ai-adapter.interface';
import type { AiRouterPort } from './ai-router';

// Async, not just sync — SANITY_SENTENCE's checker is pure/in-memory, but STORY's checker needs
// a DB-backed lexeme lookup (see checkStoryDraft in ./story/story-checker) to verify every word
// resolves to an allowlisted lexemeId. `await`ing a non-Promise value is a no-op, so this widening
// doesn't change SANITY_SENTENCE's behavior at all.
type Checker = (raw: AiRawResult, job: AiJob) => AiCheckedResult<unknown> | Promise<AiCheckedResult<unknown>>;

/** The one door. App/worker code calls `run(job)` and never touches Groq/Ollama directly.
 * Orchestrates route → adapter.generate → checker → retry/fallback — plain logic, constructed
 * directly (in the module via a factory, in tests via `new AiService(...)` with FakeAdapters). */
export class AiService {
  constructor(
    private readonly router: AiRouterPort,
    private readonly groq: AiAdapter,
    private readonly ollama: AiAdapter,
    private readonly maxRetries: number,
    // Optional: only STORY jobs need it. Undefined is fine for callers that only ever run
    // SANITY_SENTENCE (e.g. existing tests) — see checkerFor's error if a STORY job shows up anyway.
    private readonly checkStoryDraft?: Checker,
    // Optional: only CHAT_TURN jobs need it — same reasoning as checkStoryDraft above.
    private readonly checkChatTurn?: Checker,
    // Optional: only CHAT_MEMORY jobs need it — same reasoning as checkStoryDraft above. Unlike
    // checkChatTurn, this one is pure (no DB lookup), but it's still a caller-supplied checker for
    // consistency with how every other job type is wired.
    private readonly checkChatMemory?: Checker,
  ) {}

  private adapterFor(provider: AiProvider): AiAdapter {
    return provider === 'GROQ' ? this.groq : this.ollama;
  }

  private checkerFor(job: AiJob): Checker {
    switch (job.type) {
      case 'SANITY_SENTENCE':
        return checkSanitySentence;
      case 'STORY':
        if (!this.checkStoryDraft) throw new Error('STORY job requires AiService to be constructed with checkStoryDraft');
        return this.checkStoryDraft;
      case 'CHAT_TURN':
        if (!this.checkChatTurn) throw new Error('CHAT_TURN job requires AiService to be constructed with checkChatTurn');
        return this.checkChatTurn;
      case 'CHAT_MEMORY':
        if (!this.checkChatMemory) throw new Error('CHAT_MEMORY job requires AiService to be constructed with checkChatMemory');
        return this.checkChatMemory;
    }
  }

  private async attempt(provider: AiProvider, job: AiJob, checker: Checker): Promise<AiCheckedResult<unknown>> {
    console.log(`[AiService] attempt in: ${job.type} via ${provider}`);
    let raw: AiRawResult;
    try {
      raw = await this.adapterFor(provider).generate(job);
    } catch (err) {
      // Adapters are written to never throw, but this is the one door — a caller must never
      // see an unhandled rejection out of run(), even if an adapter regresses that contract.
      raw = { provider, json: null, raw: `adapter threw: ${(err as Error).message}` };
    }

    const verdict = await checker(raw, job);
    if (!verdict.ok) {
      console.error(`[AiService] attempt out: ${job.type} via ${provider} FAILED: ${verdict.reason} — ${verdict.detail}\n  raw: ${raw.raw}`);
    } else if (provider === 'GROQ') {
      // "Successful GROQ call" = the call that actually delivered a checker-approved result.
      // Precisely mirroring Groq's own billed-request count (including checker-rejected
      // content) is a possible future refinement; this is what the router needs today.
      await this.router.recordGroqSuccess();
    }
    if (verdict.ok) console.log(`[AiService] attempt out: ${job.type} via ${provider} OK`);
    return verdict;
  }

  /** `remoteOnly` is the daytime-generation guardrail: a 4GB VPS must never load the local model
   * into RAM while the API is serving. When set, GROQ is the only provider this run may ever
   * touch — if the router says quota is exhausted, or GROQ itself exhausts retries, this returns
   * `ok:false` immediately instead of falling back to OLLAMA. The caller (lazy story generation)
   * is expected to treat that as "try again later", not as a real failure. */
  async run(job: AiJob, opts: { remoteOnly?: boolean } = {}): Promise<AiCheckedResult<unknown>> {
    console.log(`[AiService] run in: ${job.type} remoteOnly=${!!opts.remoteOnly}`);
    const checker = this.checkerFor(job);
    const provider = await this.router.decide();
    console.log(`[AiService] router.decide() -> ${provider}`);

    if (opts.remoteOnly && provider !== 'GROQ') {
      console.error(`[AiService] run out: ${job.type} REMOTE_QUOTA_EXHAUSTED (router picked ${provider}, remoteOnly)`);
      return { ok: false, reason: 'REMOTE_QUOTA_EXHAUSTED', detail: 'GROQ free quota exhausted; local model not allowed for a remote-only run' };
    }

    for (let i = 0; i <= this.maxRetries; i++) {
      console.log(`[AiService] retry ${i}/${this.maxRetries} on ${provider}`);
      const verdict = await this.attempt(provider, job, checker);
      if (verdict.ok) {
        console.log(`[AiService] run out: ${job.type} shipped via ${provider}`);
        return verdict;
      }
    }

    if (opts.remoteOnly) {
      console.error(`[AiService] run out: ${job.type} REMOTE_QUOTA_EXHAUSTED (exhausted retries on ${provider})`);
      return { ok: false, reason: 'REMOTE_QUOTA_EXHAUSTED', detail: `exhausted retries on ${provider}; local fallback not allowed for a remote-only run` };
    }

    const otherProvider: AiProvider = provider === 'GROQ' ? 'OLLAMA' : 'GROQ';
    console.log(`[AiService] falling back to ${otherProvider} after exhausting ${provider}`);
    const fallbackVerdict = await this.attempt(otherProvider, job, checker);
    if (fallbackVerdict.ok) {
      console.log(`[AiService] run out: ${job.type} shipped via fallback ${otherProvider}`);
      return fallbackVerdict;
    }

    console.error(`[AiService] run out: ${job.type} OTHER (exhausted retries on ${provider} and fallback on ${otherProvider})`);
    return { ok: false, reason: 'OTHER', detail: `exhausted retries on ${provider} and fallback on ${otherProvider} for ${job.type}` };
  }
}
