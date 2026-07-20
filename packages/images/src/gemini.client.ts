const DEFAULT_MODEL = 'gemini-2.5-flash-image';
const TIMEOUT_MS = 30_000;

export class GeminiImageError extends Error {}

export async function generateCoverImage(prompt: string): Promise<{ bytes: Buffer; mimeType: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiImageError('GEMINI_API_KEY is not set');
  const model = process.env.GEMINI_IMAGE_MODEL ?? DEFAULT_MODEL;

  console.log(`[generateCoverImage] in: model=${model} prompt="${prompt.slice(0, 120)}"`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Documented auth header. Keeps the key out of URLs, proxy logs and error strings.
          'x-goog-api-key': apiKey,
        },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            // ['IMAGE'] alone is documented but flaky across versions; TEXT+IMAGE is the
            // combination Google's own samples use. We simply ignore any text part below.
            responseModalities: ['TEXT', 'IMAGE'],
            imageConfig: { aspectRatio: '16:9' },
          },
        }),
      },
    );

    const rawBody = await response.text();

    if (!response.ok) {
      // Full body: this is where "model not found", "unsupported modality" and quota
      // errors actually explain themselves.
      throw new GeminiImageError(`Gemini image request failed: HTTP ${response.status} — ${rawBody.slice(0, 800)}`);
    }

    let json: any;
    try {
      json = JSON.parse(rawBody);
    } catch {
      throw new GeminiImageError(`Gemini returned non-JSON: ${rawBody.slice(0, 300)}`);
    }

    const candidate = json.candidates?.[0];
    const inlineData = candidate?.content?.parts?.find((p: any) => p.inlineData?.data)?.inlineData;

    if (!inlineData?.data) {
      // A 200 with no image is almost always a safety block or a truncated generation.
      // Surface the reason instead of a flat "no image data".
      const reason = [
        candidate?.finishReason && `finishReason=${candidate.finishReason}`,
        json.promptFeedback?.blockReason && `blockReason=${json.promptFeedback.blockReason}`,
        candidate?.safetyRatings?.length && `safety=${JSON.stringify(candidate.safetyRatings)}`,
        !candidate && 'no candidates returned',
      ]
        .filter(Boolean)
        .join(' ');
      throw new GeminiImageError(`Gemini returned no image data. ${reason || rawBody.slice(0, 300)}`);
    }

    const bytes = Buffer.from(inlineData.data, 'base64');
    const mimeType = inlineData.mimeType ?? 'image/png';
    console.log(`[generateCoverImage] out: success model=${model} mimeType=${mimeType} bytes=${bytes.length}`);
    return { bytes, mimeType };
  } catch (err) {
    console.error(`[generateCoverImage] out: error model=${model}: ${(err as Error).message}`);
    if (err instanceof GeminiImageError) throw err;
    if ((err as Error).name === 'AbortError') throw new GeminiImageError(`Gemini image request timed out after ${TIMEOUT_MS}ms`);
    throw new GeminiImageError(`Gemini image request threw: ${(err as Error).message}`);
  } finally {
    clearTimeout(timeout);
  }
}