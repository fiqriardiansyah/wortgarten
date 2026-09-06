import { describe, expect, it } from 'vitest';
import { filterSafeFacts, isFactSafe, sanitizeSummary } from './memory-safety';

describe('isFactSafe', () => {
  it.each(['found the dative tricky', 'likes cats', 'into football', 'learning for a trip', 'practises on the bus'])(
    'accepts a harmless learning/preference fact: %s',
    (text) => {
      expect(isFactSafe(text)).toBe(true);
    },
  );

  it.each([
    'my name is Anna',
    "I'm called Max",
    'my email is anna@example.com',
    'you can reach me at +49 30 1234567',
    'I live in Berlin',
    'my address is Hauptstraße 12',
    'I go to Lincoln High School',
    'my birthday is in July',
    'I am 12 years old',
    'my mother is a doctor',
    'my salary is low right now',
    "don't tell anyone but I skip school",
    "let's meet up in person sometime",
    // Live-verified regression: the night summariser writes THIRD person about the learner, not
    // first person — a phrase-anchored pattern (e.g. requiring literal "my name is") misses these
    // entirely. Caught via live-verify against real Groq output (see project memory).
    "Sarah is the learner's name",
    "Chicago is the learner's hometown",
    'the learner lives in a small town',
    'the learner goes to Lincoln High School',
    "You're from Chicago.",
  ])('rejects a denied fact: %s', (text) => {
    expect(isFactSafe(text)).toBe(false);
  });

  it('rejects an overly long fact even with no denied keyword', () => {
    const longFact = 'a'.repeat(200);
    expect(isFactSafe(longFact)).toBe(false);
  });

  it('rejects a blank fact', () => {
    expect(isFactSafe('   ')).toBe(false);
  });
});

describe('filterSafeFacts', () => {
  it('keeps only safe facts and drops unsafe ones silently', () => {
    const kept = filterSafeFacts(['likes cats', 'my name is Anna', 'found the dative tricky']);
    expect(kept).toEqual(['likes cats', 'found the dative tricky']);
  });

  it('caps the result at maxFacts', () => {
    const kept = filterSafeFacts(['a', 'b', 'c', 'd'], 2);
    expect(kept).toEqual(['a', 'b']);
  });
});

describe('sanitizeSummary', () => {
  it('drops only the unsafe sentence, keeping the rest of the paragraph', () => {
    const summary = sanitizeSummary('You practised ordering coffee. My name is Anna and I live in Berlin. You found separable verbs tricky.');
    expect(summary).toBe('You practised ordering coffee. You found separable verbs tricky.');
  });

  it('does not apply the short-fact length cap to an ordinary narrative sentence', () => {
    const longSafeSentence =
      'You talked about your upcoming trip, practised ordering food at a restaurant, and worked through a few tricky separable verbs together.';
    expect(sanitizeSummary(longSafeSentence)).toBe(longSafeSentence);
  });
});
