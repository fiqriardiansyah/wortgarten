import { Injectable } from '@nestjs/common';
import type { SentenceTiming, StoryAudioSync, StoryParagraph } from '@wortgarten/shared';
import { buildAudioSync } from './align';
import { synthesizeGerman } from './edge-tts.client';
import { deleteObject, uploadObject } from './r2.client';

export type GenerateStoryAudioResult =
  | { ok: true; audioKey: string; audioSync: StoryAudioSync; paragraphs: StoryParagraph[]; sentenceTimings: SentenceTiming[] | null }
  | { ok: false; error: string };

/** German text only, joined the same way the reader reconstructs a paragraph's text from its
 * tokens (`segmentText`/`WordPopup` rely on the same `tokens.map(t=>t.text).join('')` invariant) —
 * paragraph breaks become the natural pauses in the narration. */
function assembleSpokenText(paragraphs: StoryParagraph[]): string {
  return paragraphs.map((paragraph) => paragraph.tokens.map((token) => token.text).join('')).join('\n\n');
}

/** The one door for story audio — app code calls this, never edge-tts or R2 directly. Every method
 * here is written to never throw: a caller can always `await` it directly with no try/catch,
 * because a failed audio generation must never turn into a failed story. Mirrors
 * `packages/images`'s `ImageService`. */
@Injectable()
export class AudioService {
  async generateStoryAudio({ storyId, paragraphs }: { storyId: string; paragraphs: StoryParagraph[] }): Promise<GenerateStoryAudioResult> {
    console.log(`[AudioService] generateStoryAudio in: storyId=${storyId} paragraphs=${paragraphs.length}`);
    try {
      const text = assembleSpokenText(paragraphs);
      const voice = process.env.EDGE_TTS_VOICE || 'de-DE-KatjaNeural';
      const rate = process.env.EDGE_TTS_RATE || '-10%';

      const { audioBytes, words } = await synthesizeGerman(text, voice, rate);
      const { audioSync, paragraphs: alignedParagraphs, sentenceTimings } = buildAudioSync(paragraphs, words);

      const key = `stories/${storyId}/audio.mp3`;
      await uploadObject(key, audioBytes, 'audio/mpeg');

      console.log(
        `[AudioService] generateStoryAudio out: success storyId=${storyId} key=${key} sync=${audioSync} words=${words.length} bytes=${audioBytes.length}`,
      );
      return { ok: true, audioKey: key, audioSync, paragraphs: alignedParagraphs, sentenceTimings };
    } catch (err) {
      console.error(`[AudioService] generateStoryAudio out: error storyId=${storyId}: ${(err as Error).message}`);
      return { ok: false, error: (err as Error).message };
    }
  }

  /** Best-effort delete, e.g. when a story is removed. Ready primitive, same as
   * `ImageService.deleteStoryCover` — this app has no story-delete feature yet, so nothing calls
   * this today. Wire it in wherever story deletion eventually lands; it never throws. */
  async deleteStoryAudio(key: string): Promise<void> {
    try {
      await deleteObject(key);
    } catch (err) {
      console.error(`[AudioService] failed to delete audio "${key}":`, (err as Error).message);
    }
  }
}
