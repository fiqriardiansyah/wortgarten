import type { AiJob } from '@wortgarten/shared';
import type { StoryVocabulary } from './select-vocabulary';

/** Builds the STORY AiJob from a vocabulary selection. `allowedWords`/`maxWords` drive the prompt
 * (display strings, human-readable) — the model never sees or is checked against a lexemeId
 * allowlist; resolution happens once, downstream in buildStoryFromDraft, against the real
 * `StoryVocabulary` object, not this job. */
export function buildStoryJob(vocab: StoryVocabulary): AiJob {
  return {
    type: 'STORY',
    allowedWords: vocab.allowlistDisplay,
    maxWords: vocab.targetWordCount,
    meta: {
      newWordDisplayLemmas: vocab.newWords.map((w) => w.displayLemma),
    },
  };
}
