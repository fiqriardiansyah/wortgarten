import type { LadderLevel, WordLevel } from '@wortgarten/shared';

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

// The real 5-rung mastery ladder (as stored on UserWord), distinct from the
// 3-bucket WordLevel above that the Home dashboard contract collapses it to.
export const ladderLevelChipVariant: Record<LadderLevel, 'new' | 'learning' | 'mastered'> = {
  NEW: 'new',
  RECOGNIZE: 'learning',
  RECALL: 'learning',
  PRODUCE: 'learning',
  MASTERED: 'mastered',
};

export const ladderLevelLabel: Record<LadderLevel, string> = {
  NEW: 'new',
  RECOGNIZE: 'recognize',
  RECALL: 'recall',
  PRODUCE: 'produce',
  MASTERED: 'mastered',
};

export const LADDER_STEPS: LadderLevel[] = ['NEW', 'RECOGNIZE', 'RECALL', 'PRODUCE', 'MASTERED'];
