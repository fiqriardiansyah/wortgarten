import type { AiJob } from '@wortgarten/shared';
import type { StoryVocabulary } from './select-vocabulary';

/** Builds the STORY AiJob from a vocabulary selection. `allowedWords`/`maxWords` drive the prompt
 * (display strings, human-readable); `meta` carries the lexemeId allowlist the checker actually
 * verifies against — the two must never be conflated (compare by id, never by string). */
export function buildStoryJob(vocab: StoryVocabulary): AiJob {
  return {
    type: 'STORY',
    allowedWords: vocab.allowlistDisplay,
    maxWords: vocab.targetWordCount,
    meta: {
      allowlistLexemeIds: [...vocab.allowlistIds],
      newWordLexemeIds: vocab.newWords.map((w) => w.lexemeId),
      newWordDisplayLemmas: vocab.newWords.map((w) => w.displayLemma),
    },
  };
}
