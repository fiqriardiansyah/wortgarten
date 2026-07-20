import { Injectable } from '@nestjs/common';
import { buildCoverPrompt, buildSubject, pickAccent } from './prompt';
import { generateCoverImage as generateWithGemini } from './gemini.client';
import { generateCoverImage as generateWithCloudflare } from './cloudflare.client';
import { resolveImageProvider } from './provider';
import { deleteObject, uploadObject } from './r2.client';

type CoverGenerator = (prompt: string) => Promise<{ bytes: Buffer; mimeType: string }>;

const GENERATORS: Record<ReturnType<typeof resolveImageProvider>, CoverGenerator> = {
  gemini: generateWithGemini,
  cloudflare: generateWithCloudflare,
};

export type GenerateStoryCoverResult = { ok: true; key: string } | { ok: false; error: string };

function extensionFor(mimeType: string): string {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  return 'png';
}

/** The one door for cover images — app code calls this, never Gemini or R2 directly. Every
 * method here is written to never throw: a caller can always `await` it directly with no
 * try/catch, because a failed cover must never turn into a failed story. */
@Injectable()
export class ImageService {
  async generateStoryCover({ storyId, englishSummary }: { storyId: string; englishSummary: string }): Promise<GenerateStoryCoverResult> {
    console.log(`[ImageService] generateStoryCover in: storyId=${storyId} summary="${englishSummary.slice(0, 80)}"`);
    try {
      const subject = buildSubject(englishSummary);
      const accent = pickAccent(storyId);
      const prompt = buildCoverPrompt({ subject, accent });

      const provider = resolveImageProvider();
      const { bytes, mimeType } = await GENERATORS[provider](prompt);
      const key = `stories/${storyId}.${extensionFor(mimeType)}`;
      await uploadObject(key, bytes, mimeType);

      console.log(`[ImageService] generateStoryCover out: success provider=${provider} storyId=${storyId} key=${key} mimeType=${mimeType} bytes=${bytes.length}`);
      return { ok: true, key };
    } catch (err) {
      console.error(`[ImageService] generateStoryCover out: error storyId=${storyId}: ${(err as Error).message}`);
      return { ok: false, error: (err as Error).message };
    }
  }

  /** Best-effort delete, e.g. when a story is removed. Built as a ready primitive per the cover
   * spec's cleanup step — this app has no story-delete feature yet, so nothing calls this today.
   * Wire it in wherever story deletion eventually lands; it never throws. */
  async deleteStoryCover(key: string): Promise<void> {
    try {
      await deleteObject(key);
    } catch (err) {
      console.error(`[ImageService] failed to delete cover "${key}":`, (err as Error).message);
    }
  }
}
