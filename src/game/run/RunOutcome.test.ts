import { describe, expect, it } from 'vitest';
import { resolveRunOutcome } from './RunOutcome';

describe('run outcome', () => {
  it.each([1, 2, 3, 4, 5, 6, 7])('does not win at dawn on day %i', (dayNumber) => {
    expect(resolveRunOutcome(null, true, 'night', 'day', dayNumber)).toBeNull();
  });

  it('wins at the transition into day 8 with a live queen', () => {
    expect(resolveRunOutcome(null, true, 'night', 'day', 8)).toBe('victory');
  });

  it.each([
    ['day', 'day', 8],
    ['day', 'night', 8],
    ['night', 'night', 8],
    ['night', 'night', 9],
  ] as const)('does not win outside the final dawn (%s to %s, day %i)', (previousPhase, phase, dayNumber) => {
    expect(resolveRunOutcome(null, true, previousPhase, phase, dayNumber)).toBeNull();
  });

  it('still wins when a night-to-day transition lands past day 8', () => {
    expect(resolveRunOutcome(null, true, 'night', 'day', 9)).toBe('victory');
  });

  it('prioritizes queen death over victory at the final dawn', () => {
    expect(resolveRunOutcome(null, false, 'night', 'day', 8)).toBe('defeat');
  });

  it('ends in defeat when the queen dies before the final dawn', () => {
    expect(resolveRunOutcome(null, false, 'day', 'day', 1)).toBe('defeat');
  });

  it('never changes a defeat into victory', () => {
    expect(resolveRunOutcome('defeat', true, 'night', 'day', 8)).toBe('defeat');
  });

  it('never changes a victory into defeat', () => {
    expect(resolveRunOutcome('victory', false, 'day', 'day', 8)).toBe('victory');
  });
});
