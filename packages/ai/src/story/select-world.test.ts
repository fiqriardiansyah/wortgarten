import { describe, expect, it } from 'vitest';
import { pickTonightsWorld } from './select-world';

describe('pickTonightsWorld', () => {
  it('always picks the just-unlocked world, even if it was just used', () => {
    const chosen = pickTonightsWorld(['everyday', 'at_home'], ['at_home'], 'at_home');
    expect(chosen).toBe('at_home');
  });

  it('ignores a just-unlocked key that is not actually unlocked', () => {
    const chosen = pickTonightsWorld(['everyday'], [], 'at_home');
    expect(chosen).toBe('everyday');
  });

  it('excludes recently-used worlds from the bag', () => {
    for (let i = 0; i < 20; i++) {
      const chosen = pickTonightsWorld(['everyday', 'at_home', 'park'], ['at_home', 'park'], null);
      expect(chosen).toBe('everyday');
    }
  });

  it('resets the bag once every unlocked world has been used, instead of ever returning nothing', () => {
    for (let i = 0; i < 20; i++) {
      const chosen = pickTonightsWorld(['everyday', 'at_home'], ['everyday', 'at_home'], null);
      expect(['everyday', 'at_home']).toContain(chosen);
    }
  });

  it('is the only unlocked world when just one exists', () => {
    expect(pickTonightsWorld(['everyday'], ['everyday'], null)).toBe('everyday');
  });
});
