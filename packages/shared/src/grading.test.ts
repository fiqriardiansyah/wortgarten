import { describe, expect, it } from 'vitest';
import {
  GRADING_MATRIX,
  buildCorrection,
  gradeBuildSentence,
  gradePickMeaning,
  gradeTypeWord,
  levenshtein,
  type LexemeResolution,
} from './grading';
import type { PlanItem, TypeWordSolution } from './session-types';

const fensterSolution: TypeWordSolution = {
  lexemeId: 'lex-fenster',
  lemma: 'Fenster',
  partOfSpeech: 'NOUN',
  gender: 'NEUTER',
  translation: 'window',
};

const schoenSolution: TypeWordSolution = {
  lexemeId: 'lex-schoen',
  lemma: 'schön',
  partOfSpeech: 'ADJECTIVE',
  gender: null,
  translation: 'beautiful',
};

const kommenSolution: TypeWordSolution = {
  lexemeId: 'lex-kommen',
  lemma: 'kommen',
  partOfSpeech: 'VERB',
  gender: null,
  translation: 'to come',
};

function resolverReturning(matches: LexemeResolution[]): (text: string) => Promise<LexemeResolution[]> {
  return async () => matches;
}

const noMatches = resolverReturning([]);

describe('gradeTypeWord — der Fenster / bare Fenster / schon-schön (acceptance criteria 1-3)', () => {
  it('exact match is CORRECT', async () => {
    expect((await gradeTypeWord('das Fenster', fensterSolution, noMatches)).result).toBe('CORRECT');
  });

  it('der Fenster (wrong article for a neuter noun) is WRONG_GENDER, not MISSING_ARTICLE', async () => {
    const outcome = await gradeTypeWord('der Fenster', fensterSolution, noMatches);
    expect(outcome.result).toBe('WRONG_GENDER');
  });

  it('bare Fenster (no article at all) is MISSING_ARTICLE, not WRONG_GENDER', async () => {
    const outcome = await gradeTypeWord('Fenster', fensterSolution, noMatches);
    expect(outcome.result).toBe('MISSING_ARTICLE');
  });

  it('schon for schön is MISSING_UMLAUT and contrasts the two real words', async () => {
    const resolver = resolverReturning([
      { lexemeId: 'lex-schon', senseId: 's1', lemma: 'schon', translation: 'already' },
    ]);
    const outcome = await gradeTypeWord('schon', schoenSolution, resolver);
    expect(outcome.result).toBe('MISSING_UMLAUT');
    expect(outcome.umlautContrast).toEqual({ typedWord: 'schon', typedTranslation: 'already' });
  });

  it('a plain-case typo (der hund) does not get misclassified as MISSING_UMLAUT', async () => {
    const hundSolution: TypeWordSolution = { lexemeId: 'lex-hund', lemma: 'Hund', partOfSpeech: 'NOUN', gender: 'MASCULINE', translation: 'dog' };
    const outcome = await gradeTypeWord('der hund', hundSolution, noMatches);
    expect(outcome.result).toBe('CORRECT_WITH_TYPO');
  });

  it('same lexeme, different form (kam for kommen) is WRONG_FORM', async () => {
    const resolver = resolverReturning([{ lexemeId: 'lex-kommen', senseId: 's1', lemma: 'kommen', translation: 'to come' }]);
    const outcome = await gradeTypeWord('kam', kommenSolution, resolver);
    expect(outcome.result).toBe('WRONG_FORM');
  });

  it('a different lexeme entirely is WRONG_MEANING', async () => {
    const resolver = resolverReturning([{ lexemeId: 'lex-gehen', senseId: 's1', lemma: 'gehen', translation: 'to go' }]);
    const outcome = await gradeTypeWord('gehen', kommenSolution, resolver);
    expect(outcome.result).toBe('WRONG_MEANING');
  });

  it('nothing resolves at all is WRONG_MEANING', async () => {
    const outcome = await gradeTypeWord('xyzzy', kommenSolution, noMatches);
    expect(outcome.result).toBe('WRONG_MEANING');
  });

  it('empty input is EMPTY', async () => {
    expect((await gradeTypeWord('   ', fensterSolution, noMatches)).result).toBe('EMPTY');
  });
});

describe('gradePickMeaning / gradeBuildSentence', () => {
  it('pick meaning: match, mismatch, empty', () => {
    expect(gradePickMeaning({ chosenSenseId: 'a', correctSenseId: 'a' })).toBe('CORRECT');
    expect(gradePickMeaning({ chosenSenseId: 'b', correctSenseId: 'a' })).toBe('WRONG_MEANING');
    expect(gradePickMeaning({ chosenSenseId: null, correctSenseId: 'a' })).toBe('EMPTY');
  });

  it('pick meaning: the correct sense stays correct across every display position', () => {
    const shuffledOrders = [
      ['correct', 'b', 'c', 'd'],
      ['b', 'correct', 'c', 'd'],
      ['b', 'c', 'correct', 'd'],
      ['b', 'c', 'd', 'correct'],
    ];
    for (const options of shuffledOrders) {
      const chosenSenseId = options[options.indexOf('correct')];
      expect(gradePickMeaning({ chosenSenseId, correctSenseId: 'correct' })).toBe('CORRECT');
    }
  });

  it('build sentence: exact order, wrong order, empty', () => {
    expect(gradeBuildSentence({ submittedTileIds: ['a', 'b', 'c'], correctTileOrder: ['a', 'b', 'c'] })).toBe('CORRECT');
    expect(gradeBuildSentence({ submittedTileIds: ['b', 'a', 'c'], correctTileOrder: ['a', 'b', 'c'] })).toBe('WRONG_FORM');
    expect(gradeBuildSentence({ submittedTileIds: [], correctTileOrder: ['a', 'b', 'c'] })).toBe('EMPTY');
  });
});

describe('levenshtein', () => {
  it('computes edit distance', () => {
    expect(levenshtein('Hund', 'Hund')).toBe(0);
    expect(levenshtein('hund', 'Hund')).toBe(1);
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });
});

describe('GRADING_MATRIX — the Part 5 rule that only WRONG_MEANING drops the ladder', () => {
  it('CORRECT and CORRECT_WITH_TYPO climb; nothing else does', () => {
    for (const [result, entry] of Object.entries(GRADING_MATRIX)) {
      if (result === 'CORRECT' || result === 'CORRECT_WITH_TYPO') {
        expect(entry.ladderAction).toBe('climb');
      } else if (result === 'WRONG_MEANING') {
        expect(entry.ladderAction).toBe('drop');
      } else {
        expect(entry.ladderAction).toBe('hold');
      }
    }
  });

  it('grammar/keyboard errors rate HARD, not AGAIN — der Fenster must not nuke the interval', () => {
    expect(GRADING_MATRIX.WRONG_GENDER.fsrsRating).toBe('HARD');
    expect(GRADING_MATRIX.MISSING_ARTICLE.fsrsRating).toBe('HARD');
    expect(GRADING_MATRIX.MISSING_UMLAUT.fsrsRating).toBe('HARD');
    expect(GRADING_MATRIX.WRONG_FORM.fsrsRating).toBe('HARD');
  });

  it('only WRONG_MEANING and EMPTY rate AGAIN', () => {
    expect(GRADING_MATRIX.WRONG_MEANING.fsrsRating).toBe('AGAIN');
    expect(GRADING_MATRIX.EMPTY.fsrsRating).toBe('AGAIN');
  });

  it('everything except the two CORRECT variants requeues', () => {
    expect(GRADING_MATRIX.CORRECT.requeue).toBe(false);
    expect(GRADING_MATRIX.CORRECT_WITH_TYPO.requeue).toBe(false);
    for (const result of ['MISSING_UMLAUT', 'MISSING_ARTICLE', 'WRONG_GENDER', 'WRONG_FORM', 'WRONG_MEANING', 'EMPTY'] as const) {
      expect(GRADING_MATRIX[result].requeue).toBe(true);
    }
  });
});

describe('buildCorrection', () => {
  const item: PlanItem = {
    id: 'p1',
    userWordId: 'uw1',
    senseId: 'sense1',
    lexemeId: 'lex-fenster',
    isRetry: false,
    levelAtPlanTime: 'RECALL',
    taskType: 'TYPE_WORD',
    payload: { prompt: 'window', partOfSpeech: 'NOUN', requiresArticle: true },
    solution: fensterSolution,
  };

  it('WRONG_GENDER tip names the correct gender and article, bolds the lemma', () => {
    const correction = buildCorrection(item, 'WRONG_GENDER');
    expect(correction.correctAnswer).toBe('das Fenster');
    expect(correction.tip).toContain('neuter');
    expect(correction.tip).toContain('*das*');
  });

  it('MISSING_ARTICLE tip mentions the article requirement', () => {
    const correction = buildCorrection(item, 'MISSING_ARTICLE');
    expect(correction.correctAnswer).toBe('das Fenster');
    expect(correction.emphasize).toBe('das');
  });

  it('MISSING_UMLAUT contrasts the two real words when a contrast is available', () => {
    const correction = buildCorrection(item, 'MISSING_UMLAUT', {
      umlautContrast: { typedWord: 'schon', typedTranslation: 'already' },
    });
    expect(correction.tip).toContain('schon');
    expect(correction.tip).toContain('already');
  });
});
