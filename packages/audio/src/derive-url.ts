/** The DB only ever stores the R2 object key, never a full URL — keys stay valid across domain or
 * CDN changes. This derives the public URL at response time. Mirrors
 * `packages/images/src/derive-url.ts`. */
export function deriveAudioUrl(audioKey: string | null): string | null {
  if (!audioKey) return null;
  const base = process.env.R2_PUBLIC_BASE_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, '')}/${audioKey}`;
}
