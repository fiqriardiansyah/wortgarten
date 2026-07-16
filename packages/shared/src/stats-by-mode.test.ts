import { describe, expect, it } from 'vitest';
import { StatsByModeSchema } from './session-types';

describe('StatsByModeSchema', () => {
  it.each([
    ['no modes', {}],
    ['one mode', { PICK_MEANING: { total: 6, correct: 6 } }],
    ['two modes', { PICK_MEANING: { total: 6, correct: 6 }, TYPE_WORD: { total: 7, correct: 3 } }],
    [
      'all modes',
      {
        PICK_MEANING: { total: 6, correct: 6 },
        TYPE_WORD: { total: 7, correct: 3 },
        BUILD_SENTENCE: { total: 3, correct: 1 },
      },
    ],
  ])('accepts %s', (_label, value) => {
    expect(StatsByModeSchema.parse(value)).toEqual(value);
  });
});
