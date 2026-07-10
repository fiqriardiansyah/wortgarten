import type { WordLevel } from '@wortgarten/shared';

export const wordLevelChipVariant: Record<WordLevel, 'new' | 'learning' | 'mastered'> = {
  new: 'new',
  learning: 'learning',
  mastered: 'mastered',
};

export const wordLevelLabel: Record<WordLevel, string> = {
  new: 'new',
  learning: 'level 1',
  mastered: 'mastered',
};
