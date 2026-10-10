import { describe, expect, it } from 'vitest';
import { DIRECTIONS, directionAngle, directionIndex, snapAngle } from './directions';

const STEP = (Math.PI * 2) / 16;

describe('16-direction rotation snapping', () => {
  it('has 16 directions, 22.5° apart, starting at facing right', () => {
    expect(DIRECTIONS).toBe(16);
    expect(directionAngle(0)).toBe(0);
    expect(directionAngle(4)).toBeCloseTo(Math.PI / 2);
    expect(directionAngle(1) - directionAngle(0)).toBeCloseTo(STEP);
  });

  it('snaps an angle to the nearest direction', () => {
    expect(directionIndex(0)).toBe(0);
    expect(directionIndex(STEP * 0.49)).toBe(0);
    expect(directionIndex(STEP * 0.51)).toBe(1);
    expect(directionIndex(Math.PI / 2)).toBe(4);
    expect(directionIndex(Math.PI)).toBe(8);
    expect(directionIndex(-Math.PI / 2)).toBe(12);
  });

  it('wraps negative angles and whole turns onto 0..15', () => {
    expect(directionIndex(Math.PI * 2)).toBe(0);
    expect(directionIndex(-STEP)).toBe(15);
    expect(directionIndex(Math.PI * 6 + STEP * 3)).toBe(3);
    expect(directionIndex(-Math.PI * 2 - STEP * 0.4)).toBe(0);
    expect(directionIndex(Math.PI * 2 - STEP * 0.4)).toBe(0);
  });

  it('snaps every angle to a multiple of 22.5° within half a step', () => {
    for (let a = -7; a <= 7; a += 0.037) {
      const snapped = snapAngle(a);
      const steps = snapped / STEP;
      expect(Math.abs(steps - Math.round(steps))).toBeLessThan(1e-9);
      const diff = Math.atan2(Math.sin(a - snapped), Math.cos(a - snapped));
      expect(Math.abs(diff)).toBeLessThanOrEqual(STEP / 2 + 1e-9);
    }
  });
});
