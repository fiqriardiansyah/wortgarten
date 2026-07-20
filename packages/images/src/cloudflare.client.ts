// Workers AI's binary-output models (e.g. Stable Diffusion XL) support explicit width/height —
// this is what gives us aspect-ratio control equivalent to Gemini's `imageConfig.aspectRatio`.
// 1024x576 = 16:9, both multiples of 8 (SDXL's constraint), within its 256-2048 accepted range.
const DEFAULT_MODEL = '@cf/stabilityai/stable-diffusion-xl-base-1.0';
const WIDTH = 1024;
const HEIGHT = 576;
const TIMEOUT_MS = 30_000;

export class CloudflareImageError extends Error {}

/** Cloudflare Workers AI models reply in one of two shapes for the same "generate an image" job:
 * some (SDXL) stream the image bytes directly with an `image/*` content-type; others (e.g.
 * flux-1-schnell) return a JSON envelope with a base64 `result.image`. Sniffing content-type
 * lets this client work with either without a per-model branch the caller has to know about —
 * so switching `CLOUDFLARE_IMAGE_MODEL` never requires a code change. */
export async function generateCoverImage(prompt: string): Promise<{ bytes: Buffer; mimeType: string }> {
  // Reuses R2_ACCOUNT_ID — R2 and Workers AI are the same Cloudflare account in this project.
  const accountId = process.env.R2_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId) throw new CloudflareImageError('R2_ACCOUNT_ID is not set (reused as the Cloudflare account id for Workers AI)');
  if (!token) throw new CloudflareImageError('CLOUDFLARE_API_TOKEN is not set');
  const model = process.env.CLOUDFLARE_IMAGE_MODEL ?? DEFAULT_MODEL;

  console.log(`[cloudflare.generateCoverImage] in: model=${model} prompt="${prompt.slice(0, 120)}"`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ prompt, width: WIDTH, height: HEIGHT }),
    });

    const contentType = response.headers.get('content-type') ?? '';

    if (response.ok && contentType.startsWith('image/')) {
      const bytes = Buffer.from(await response.arrayBuffer());
      console.log(`[cloudflare.generateCoverImage] out: success (binary) model=${model} mimeType=${contentType} bytes=${bytes.length}`);
      return { bytes, mimeType: contentType.split(';')[0] };
    }

    const rawBody = await response.text();

    if (!response.ok) {
      throw new CloudflareImageError(`Cloudflare Workers AI request failed: HTTP ${response.status} — ${rawBody.slice(0, 800)}`);
    }

    let json: any;
    try {
      json = JSON.parse(rawBody);
    } catch {
      throw new CloudflareImageError(`Cloudflare Workers AI returned an unexpected non-image response: ${rawBody.slice(0, 300)}`);
    }

    if (json.success === false) {
      const message = (json.errors ?? []).map((e: { message?: string }) => e.message).join('; ') || 'unknown error';
      throw new CloudflareImageError(`Cloudflare Workers AI error: ${message}`);
    }

    const base64 = json.result?.image;
    if (!base64) throw new CloudflareImageError(`Cloudflare Workers AI returned no image data: ${rawBody.slice(0, 300)}`);

    const bytes = Buffer.from(base64, 'base64');
    console.log(`[cloudflare.generateCoverImage] out: success (base64 json) model=${model} bytes=${bytes.length}`);
    return { bytes, mimeType: 'image/png' };
  } catch (err) {
    console.error(`[cloudflare.generateCoverImage] out: error model=${model}: ${(err as Error).message}`);
    if (err instanceof CloudflareImageError) throw err;
    if ((err as Error).name === 'AbortError') throw new CloudflareImageError(`Cloudflare Workers AI request timed out after ${TIMEOUT_MS}ms`);
    throw new CloudflareImageError(`Cloudflare Workers AI request threw: ${(err as Error).message}`);
  } finally {
    clearTimeout(timeout);
  }
}
