import { describe, expect, it } from 'vitest';
import type { PartOfSpeech } from './lexeme';
import { clauseFinalTokenIndices, isFiniteVerbForm, resolveSeparableSentence, type SeparableMatchLike } from './separable';
import { tokenizeWithOffsets } from './tokenizer';

interface FakeMatch extends SeparableMatchLike {
  lexeme: { lemma: string; partOfSpeech: PartOfSpeech; separablePrefix: string | null };
}

function match(lemma: string, partOfSpeech: PartOfSpeech, separablePrefix: string | null = null, isFiniteForm = true): FakeMatch {
  return { lexeme: { lemma, partOfSpeech, separablePrefix }, isFiniteForm };
}

// Toy dictionary: "rufe" is both a complete plain verb (rufen) and the finite stem of the
// separable "anrufen" (prefix "an") — the real-world overlap that makes this fix necessary.
const DICTIONARY: Record<string, FakeMatch[]> = {
  ich: [match('ich', 'PRONOUN')],
  rufe: [match('rufen', 'VERB'), match('anrufen', 'VERB', 'an')],
  dich: [match('dich', 'PRONOUN')],
  an: [match('an', 'PREPOSITION')],
  denke: [match('denken', 'VERB')],
};

function resolve(token: string): FakeMatch[] {
  return DICTIONARY[token.toLowerCase()] ?? [];
}

describe('clauseFinalTokenIndices', () => {
  it('marks the last real word before terminal punctuation as clause-final', () => {
    const text = 'Ich rufe dich an.';
    const spans = tokenizeWithOffsets(text);
    const flags = clauseFinalTokenIndices(text, spans);
    expect(flags.has(spans.length - 1)).toBe(true); // "an"
    expect(flags.has(0)).toBe(false); // "Ich"
  });

  it('does not mark a word mid-clause, even if a later word ends the sentence', () => {
    const text = 'Ich denke an dich.';
    const spans = tokenizeWithOffsets(text);
    const flags = clauseFinalTokenIndices(text, spans);
    const anIndex = spans.findIndex((s) => s.token === 'an');
    expect(flags.has(anIndex)).toBe(false);
  });

  it('marks a word immediately before a comma as clause-final', () => {
    const text = 'Ruf mich an, bitte.';
    const spans = tokenizeWithOffsets(text);
    const flags = clauseFinalTokenIndices(text, spans);
    const anIndex = spans.findIndex((s) => s.token === 'an');
    expect(flags.has(anIndex)).toBe(true);
  });

  it('does not treat a colon inside time notation as a clause boundary', () => {
    const text = 'Bitte rufen Sie mich gegen 7:30 Uhr an.';
    const spans = tokenizeWithOffsets(text);
    const flags = clauseFinalTokenIndices(text, spans);
    const gegenIndex = spans.findIndex((s) => s.token === 'gegen');
    expect(flags.has(gegenIndex)).toBe(false);
  });

  it('treats a colon introducing a following clause as a real clause boundary', () => {
    const text = 'Egal, was Maria trägt: sie sieht immer toll aus.';
    const spans = tokenizeWithOffsets(text);
    const flags = clauseFinalTokenIndices(text, spans);
    const traegtIndex = spans.findIndex((s) => s.token === 'trägt');
    expect(flags.has(traegtIndex)).toBe(true);
  });
});

describe('isFiniteVerbForm', () => {
  it('treats unknown (no tags recorded) as finite', () => {
    expect(isFiniteVerbForm(undefined)).toBe(true);
  });
  it('rejects a participle-tagged form', () => {
    expect(isFiniteVerbForm(['participle', 'past'])).toBe(false);
  });
  it('accepts a genuinely conjugated form', () => {
    expect(isFiniteVerbForm(['first-person', 'singular', 'present'])).toBe(true);
  });
  it('accepts infinitive/bare-lemma tagged forms — German orthography already makes this safe (a separable verb\'s own infinitive is always spelled fused, never the bare stem), and excluding them would wrongly block the polite ("Sie") imperative, which kaikki tags identically to the infinitive', () => {
    expect(isFiniteVerbForm(['infinitive'])).toBe(true);
    expect(isFiniteVerbForm(['lemma'])).toBe(true);
  });
});

describe('resolveSeparableSentence', () => {
  it('"Ich rufe dich an." merges rufe + an into anrufen, not rufen + an separately', async () => {
    const text = 'Ich rufe dich an.';
    const spans = tokenizeWithOffsets(text);
    const tokens = spans.map((s) => s.token);
    const clauseFinal = clauseFinalTokenIndices(text, spans);

    const slots = await resolveSeparableSentence(tokens, (t) => resolve(t), clauseFinal);

    const merged = slots.find((s) => s.tokens.length === 2);
    expect(merged?.tokens).toEqual(['rufe', 'an']);
    expect(merged?.matches).toHaveLength(1);
    expect(merged?.matches[0].lexeme.lemma).toBe('anrufen');

    const standaloneAn = slots.find((s) => s.tokens.length === 1 && s.tokens[0] === 'an');
    expect(standaloneAn).toBeUndefined();
  });

  it('"Ich denke an dich." does not merge — "an" is not clause-final, so it stays the preposition', async () => {
    const text = 'Ich denke an dich.';
    const spans = tokenizeWithOffsets(text);
    const tokens = spans.map((s) => s.token);
    const clauseFinal = clauseFinalTokenIndices(text, spans);

    const slots = await resolveSeparableSentence(tokens, (t) => resolve(t), clauseFinal);

    expect(slots.every((s) => s.tokens.length === 1)).toBe(true);
    const denkeSlot = slots.find((s) => s.tokens[0] === 'denke');
    expect(denkeSlot?.matches.map((m) => m.lexeme.lemma)).toEqual(['denken']);
    const anSlot = slots.find((s) => s.tokens[0] === 'an');
    expect(anSlot?.matches.map((m) => m.lexeme.lemma)).toEqual(['an']);
  });

  it('a non-finite match (infinitive) never seeds a reassembly candidate', async () => {
    const tokens = ['rufe', 'an'];
    const nonFinite: Record<string, FakeMatch[]> = {
      rufe: [match('rufen', 'VERB'), match('anrufen', 'VERB', 'an', false)],
      an: [match('an', 'PREPOSITION')],
    };
    const slots = await resolveSeparableSentence(tokens, (t) => nonFinite[t] ?? [], new Set([1]));
    expect(slots.every((s) => s.tokens.length === 1)).toBe(true);
  });

  it('known limitation: when two distinct verbs in one clause each have a separable sibling sharing the same prefix, the first-queued one wins the prefix (no cheap positional signal distinguishes them)', async () => {
    // "Er stand da und sah mich an." really means "stood there" (plain stehen) + "looked at me"
    // (ansehen) — but "stehen" also has a real separable sibling "anstehen" sharing the same "an",
    // and "stand" is queued first. This is documented, accepted behavior, not silently wrong.
    const tokens = ['stand', 'da', 'sah', 'an'];
    const dict: Record<string, FakeMatch[]> = {
      stand: [match('stehen', 'VERB'), match('anstehen', 'VERB', 'an')],
      da: [match('da', 'ADVERB')],
      sah: [match('sehen', 'VERB'), match('ansehen', 'VERB', 'an')],
      an: [match('an', 'PREPOSITION')],
    };
    const slots = await resolveSeparableSentence(tokens, (t) => dict[t] ?? [], new Set([3]));
    const merged = slots.find((s) => s.tokens.length === 2);
    expect(merged?.tokens).toEqual(['stand', 'an']);
    expect(merged?.matches[0].lexeme.lemma).toBe('anstehen');
  });

  it('without clauseFinalIndices, merges unguarded (legacy behavior for bare token arrays)', async () => {
    const tokens = ['rufe', 'dich', 'an', 'sitze', 'auf'];
    const dict: Record<string, FakeMatch[]> = {
      rufe: [match('anrufen', 'VERB', 'an'), match('aufrufen', 'VERB', 'auf')],
      dich: [match('dich', 'PRONOUN')],
      an: [],
      sitze: [match('sitzen', 'VERB')],
      auf: [],
    };
    const slots = await resolveSeparableSentence(tokens, (t) => dict[t] ?? [], undefined);
    const rufeSlot = slots.find((s) => s.tokens[0] === 'rufe');
    expect(rufeSlot?.tokens).toEqual(['rufe', 'an']);
    expect(rufeSlot?.matches[0].lexeme.lemma).toBe('anrufen');
  });

  it('a pending candidate does not survive a clause boundary', async () => {
    // "Ich rufe, wenn ich Zeit habe, an." — contrived but exercises the boundary-clear: a comma
    // right after the verb should drop the pending candidate before "an" ever gets a chance,
    // since a genuinely separated prefix never sits in a later clause.
    const text = 'Ich rufe, dich an.';
    const spans = tokenizeWithOffsets(text);
    const tokens = spans.map((s) => s.token);
    const clauseFinal = clauseFinalTokenIndices(text, spans);
    const slots = await resolveSeparableSentence(tokens, (t) => resolve(t), clauseFinal);
    expect(slots.every((s) => s.tokens.length === 1)).toBe(true);
  });
});
