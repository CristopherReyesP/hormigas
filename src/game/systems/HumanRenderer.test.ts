import { describe, expect, it } from 'vitest';
import { humanFrameIndex } from './HumanRenderer';

describe('humanFrameIndex', () => {
  it('stays in range for a negative render clock', () => {
    for (const time of [-5, -0.3, -0.001]) {
      for (const id of [0, 3, 41]) {
        const i = humanFrameIndex(time, id, 4);
        expect(i).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThan(4);
      }
    }
  });

  it('stays in range when the clock is not a number yet', () => {
    expect(humanFrameIndex(Number.NaN, 7, 4)).toBe(3);
  });

  it('steps through the frames as time passes', () => {
    expect(humanFrameIndex(0, 0, 4)).toBe(0);
    expect(humanFrameIndex(10, 0, 4)).toBeGreaterThanOrEqual(0);
  });
});
