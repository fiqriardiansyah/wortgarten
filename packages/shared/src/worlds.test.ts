import { describe, expect, it } from 'vitest';
import { computeWorldProgress, type WorldDef } from './worlds';

const everyday: WorldDef = { key: 'everyday', name: 'Everyday', icon: '🌤️', hint: 'in everyday life', requiredCount: 0 };
const atHome: WorldDef = { key: 'at_home', name: 'At home', icon: '🏠', hint: 'at home', requiredCount: 3 };

describe('computeWorldProgress', () => {
  it('a requiredCount:0 world is always unlocked, even with zero known words', () => {
    const [entry] = computeWorldProgress([everyday], {}, new Set());
    expect(entry.isUnlocked).toBe(true);
    expect(entry.haveCount).toBe(0);
  });

  it('is locked below requiredCount with no recorded unlock row', () => {
    const [entry] = computeWorldProgress([atHome], { at_home: 2 }, new Set());
    expect(entry.isUnlocked).toBe(false);
    expect(entry.haveCount).toBe(2);
  });

  it('is unlocked once haveCount reaches requiredCount, even with no recorded row yet (bootstrap fallback)', () => {
    const [entry] = computeWorldProgress([atHome], { at_home: 3 }, new Set());
    expect(entry.isUnlocked).toBe(true);
  });

  it('stays unlocked via a recorded row even if haveCount later drops back below requiredCount', () => {
    const [entry] = computeWorldProgress([atHome], { at_home: 1 }, new Set(['at_home']));
    expect(entry.isUnlocked).toBe(true);
    expect(entry.haveCount).toBe(1);
  });

  it('computes independent progress per world', () => {
    const entries = computeWorldProgress([everyday, atHome], { at_home: 1 }, new Set());
    expect(entries).toEqual([
      {
        key: 'everyday',
        name: 'Everyday',
        icon: '🌤️',
        hint: 'in everyday life',
        requiredCount: 0,
        haveCount: 0,
        addedCount: 0,
        knownWords: [],
        isUnlocked: true,
      },
      {
        key: 'at_home',
        name: 'At home',
        icon: '🏠',
        hint: 'at home',
        requiredCount: 3,
        haveCount: 1,
        addedCount: 0,
        knownWords: [],
        isUnlocked: false,
      },
    ]);
  });

  it('carries addedCount and knownWords through untouched by the unlock math', () => {
    const [entry] = computeWorldProgress(
      [atHome],
      { at_home: 1 },
      new Set(),
      { at_home: 2 },
      { at_home: [{ lexemeId: 'l1', displayLemma: 'das Haus' }] },
    );
    expect(entry.addedCount).toBe(2);
    expect(entry.knownWords).toEqual([{ lexemeId: 'l1', displayLemma: 'das Haus' }]);
    expect(entry.isUnlocked).toBe(false);
  });
});
