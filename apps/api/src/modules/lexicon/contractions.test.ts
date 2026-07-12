import { describe, expect, it } from 'vitest';
import { resolveContraction } from './contractions';

describe('resolveContraction', () => {
  it('maps fused preposition+article surfaces to their base preposition', () => {
    expect(resolveContraction('im')).toBe('in');
    expect(resolveContraction('am')).toBe('an');
    expect(resolveContraction('zum')).toBe('zu');
    expect(resolveContraction('zur')).toBe('zu');
    expect(resolveContraction('beim')).toBe('bei');
    expect(resolveContraction('vom')).toBe('von');
    expect(resolveContraction('ins')).toBe('in');
    expect(resolveContraction('ans')).toBe('an');
    expect(resolveContraction('aufs')).toBe('auf');
    expect(resolveContraction('fürs')).toBe('für');
    expect(resolveContraction('durchs')).toBe('durch');
    expect(resolveContraction('ums')).toBe('um');
  });

  it('is case-insensitive and folds umlauts, like every other lookup key', () => {
    expect(resolveContraction('Im')).toBe('in');
    expect(resolveContraction('FURS')).toBe('für');
  });

  it('returns undefined for a surface that is not a contraction', () => {
    expect(resolveContraction('in')).toBeUndefined();
    expect(resolveContraction('Park')).toBeUndefined();
  });
});
