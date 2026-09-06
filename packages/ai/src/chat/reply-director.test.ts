import { describe, expect, it } from 'vitest';
import { pickNextReplyPlan, type ReplyDirectorInput } from './reply-director';

const distractors = ['Wasser', 'Haus', 'gehen', 'Baum', 'Buch', 'essen'];

function input(overrides: Partial<ReplyDirectorInput> = {}): ReplyDirectorInput {
  return { enabled: true, suggestedReplies: [], rustyWords: [], turnIndex: 0, lastMode: null, ...overrides };
}

const rustyWord = (n: number) => ({ lexemeId: `lex-${n}`, display: `wort${n}` });

describe('pickNextReplyPlan', () => {
  it('CHAT_REPLY_VARIETY off: always "type", no scaffold, regardless of everything else', () => {
    const plan = pickNextReplyPlan(
      input({ enabled: false, turnIndex: 3, suggestedReplies: ['Ja, gerne!', 'Nein danke.'], rustyWords: [rustyWord(1), rustyWord(2), rustyWord(3)] }),
      distractors,
    );
    expect(plan).toEqual({ mode: 'type' });
  });

  it('picks "choice" on a choice-eligible turn when >=2 suggestedReplies exist', () => {
    const plan = pickNextReplyPlan(input({ turnIndex: 3, suggestedReplies: ['Ja, gerne!', 'Nein danke.', 'Vielleicht.'] }), distractors);
    expect(plan.mode).toBe('choice');
    expect(plan.scaffold?.options).toEqual(['Ja, gerne!', 'Nein danke.', 'Vielleicht.']);
  });

  it('never repeats "choice" twice in a row even on an eligible turnIndex', () => {
    const plan = pickNextReplyPlan(input({ turnIndex: 3, lastMode: 'choice', suggestedReplies: ['Ja, gerne!', 'Nein danke.'] }), distractors);
    expect(plan.mode).not.toBe('choice');
  });

  it('does not pick "choice" with fewer than 2 suggestedReplies', () => {
    const plan = pickNextReplyPlan(input({ turnIndex: 3, suggestedReplies: ['Ja, gerne!'] }), distractors);
    expect(plan.mode).not.toBe('choice');
  });

  it('picks "tiles" on a tiles-eligible turn, built from a short suggested reply + known distractors', () => {
    const plan = pickNextReplyPlan(input({ turnIndex: 4, suggestedReplies: ['Ich gehe ins Haus'] }), distractors);
    expect(plan.mode).toBe('tiles');
    const tiles = plan.scaffold?.tileWords ?? [];
    expect(tiles).toHaveLength(4 + 3); // 4 base words + 3 distractors
    for (const w of ['Ich', 'gehe', 'ins', 'Haus']) expect(tiles).toContain(w);
  });

  it('never picks "tiles" on the very first user turn (turnIndex 0), even if otherwise eligible', () => {
    const plan = pickNextReplyPlan(input({ turnIndex: 0, suggestedReplies: ['Ich gehe.'] }), distractors);
    expect(plan.mode).not.toBe('tiles');
  });

  it('never repeats "tiles" twice in a row', () => {
    const plan = pickNextReplyPlan(input({ turnIndex: 4, lastMode: 'tiles', suggestedReplies: ['Ich gehe.'] }), distractors);
    expect(plan.mode).not.toBe('tiles');
  });

  it('skips "tiles" when every suggested reply is too long, falling through', () => {
    const plan = pickNextReplyPlan(input({ turnIndex: 4, suggestedReplies: ['Ich gehe heute Abend sehr spät ins Haus zurück'] }), distractors);
    expect(plan.mode).not.toBe('tiles');
  });

  it('nudges rusty words via "type" once there are >=3, on a turn that is neither choice- nor tiles-eligible', () => {
    const plan = pickNextReplyPlan(input({ turnIndex: 1, rustyWords: [rustyWord(1), rustyWord(2), rustyWord(3), rustyWord(4)] }), distractors);
    expect(plan.mode).toBe('type');
    expect(plan.scaffold?.rustyWords).toHaveLength(3);
  });

  it('does not nudge with fewer than 3 rusty words', () => {
    const plan = pickNextReplyPlan(input({ turnIndex: 1, rustyWords: [rustyWord(1), rustyWord(2)] }), distractors);
    expect(plan).toEqual({ mode: 'type' });
  });

  it('falls all the way through to plain "type" with no scaffold when nothing else fits', () => {
    const plan = pickNextReplyPlan(input({ turnIndex: 1 }), distractors);
    expect(plan).toEqual({ mode: 'type' });
  });
});
