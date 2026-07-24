import type { AiJob } from '@wortgarten/shared';
import type { StoryVocabulary } from './select-vocabulary';
import type { SelectedWorld } from './select-world';

/** Builds the STORY AiJob from a vocabulary selection. `allowedWords`/`maxWords` drive the prompt
 * (display strings, human-readable) — the model never sees or is checked against a lexemeId
 * allowlist; resolution happens once, downstream in buildStoryFromDraft, against the real
 * `StoryVocabulary` object, not this job. `world`, when chosen, adds one hint line to the prompt
 * (see prompts.ts's storyPrompt) — a hint, never a rule; the checker never validates it. */
export function buildStoryJob(vocab: StoryVocabulary, world?: SelectedWorld | null): AiJob {
  return {
    type: 'STORY',
    allowedWords: vocab.allowlistDisplay,
    maxWords: vocab.targetWordCount,
    meta: {
      newWordDisplayLemmas: vocab.newWords.map((w) => w.displayLemma),
      worldHint: world ? `Set this story ${world.hint}.` : undefined,
    },
  };
}
