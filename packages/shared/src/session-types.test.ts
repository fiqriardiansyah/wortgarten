import { describe, expect, it } from 'vitest';
import { PickMeaningOptionSchema, PickMeaningSolutionSchema, TaskResponseSchema } from './session-types';

describe('PICK_MEANING sense identity schemas', () => {
  it('normalizes an option and solution from an already-frozen legacy plan', () => {
    expect(PickMeaningOptionSchema.parse({ id: 'sense-bench', translation: 'bench' })).toEqual({
      senseId: 'sense-bench',
      label: 'bench',
    });
    expect(
      PickMeaningSolutionSchema.parse({
        correctOptionId: 'sense-bench',
        translation: 'bench',
        lemma: 'Bank',
        partOfSpeech: 'NOUN',
        gender: 'FEMININE',
      }),
    ).toEqual({
      correctSenseId: 'sense-bench',
      correctLabel: 'bench',
      lemma: 'Bank',
      partOfSpeech: 'NOUN',
      gender: 'FEMININE',
    });
  });

  it('normalizes a legacy client response to chosenSenseId', () => {
    expect(TaskResponseSchema.parse({ taskType: 'PICK_MEANING', selectedOptionId: 'sense-bench' })).toEqual({
      taskType: 'PICK_MEANING',
      chosenSenseId: 'sense-bench',
    });
  });
});
