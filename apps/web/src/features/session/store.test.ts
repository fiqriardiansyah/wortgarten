import { describe, expect, it } from 'vitest';
import { nextTaskIndex } from './store';

describe('session retry cursor', () => {
  it('allows the server cursor to reach the terminal index after the final failed retry', () => {
    expect(nextTaskIndex(5, 5)).toBe(5);
  });

  it('still bounds a malformed cursor to the task list length', () => {
    expect(nextTaskIndex(99, 5)).toBe(5);
  });
});
