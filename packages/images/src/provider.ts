export type ImageProvider = 'gemini' | 'cloudflare';

const DEFAULT_PROVIDER: ImageProvider = 'gemini';

/** One active provider at a time, picked by config — not a quota-aware router and not a
 * failure-triggered fallback chain. Keeps the "one generation, one outcome" invariant: whichever
 * provider is selected, a failure there is still a plain no-op (see `attachStoryCover`), never a
 * cross-provider retry. Switch providers by editing `IMAGE_PROVIDER`, no code change. */
export function resolveImageProvider(): ImageProvider {
  const raw = (process.env.IMAGE_PROVIDER ?? DEFAULT_PROVIDER).trim().toLowerCase();
  if (raw === 'gemini' || raw === 'cloudflare') return raw;
  throw new Error(`Unknown IMAGE_PROVIDER "${raw}" — expected "gemini" or "cloudflare"`);
}
