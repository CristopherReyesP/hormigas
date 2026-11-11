import { describe, expect, it } from 'vitest';
import { CAMP, retreatPoint, tickCamp, type CampState } from './campLimit';

const run = (state: CampState, distance: number, hasPrey: boolean, seconds: number) => {
  let last: ReturnType<typeof tickCamp> = 'hunt';
  for (let t = 0; t < seconds; t += 0.1) {
    last = tickCamp(state, distance, hasPrey, 0.1);
    if (last === 'start') return last;
  }
  return last;
};

describe('no camping on the nest', () => {
  it('a hunter on the nest with nothing to hunt soon withdraws', () => {
    const state: CampState = {};
    expect(run(state, 2, false, CAMP.idlePatience - 1)).toBe('hunt');
    expect(run(state, 2, false, 2)).toBe('start');
    expect(tickCamp(state, 2, true, 0.1)).toBe('away');
  });

  it('even while it feeds it has had enough after the limit', () => {
    const state: CampState = {};
    expect(run(state, 3, true, CAMP.limit - 1)).toBe('hunt');
    expect(run(state, 3, true, 2)).toBe('start');
  });

  it('far from the nest it never withdraws, and the tally runs down', () => {
    const state: CampState = {};
    run(state, 3, true, 10);
    expect(run(state, CAMP.radius + 5, false, 200)).toBe('hunt');
    expect(state.camp).toBe(0);
  });

  it('it hunts again once the time away is over', () => {
    const state: CampState = {};
    run(state, 2, false, CAMP.idlePatience + 1);
    expect(run(state, 30, false, CAMP.withdrawSeconds - 1)).toBe('away');
    expect(run(state, 30, false, 2)).toBe('hunt');
    expect(state.withdraw).toBeUndefined();
  });

  it('the place to wait is far from the colony, on walkable ground inside the zone', () => {
    const bounds = { x0: 0, y0: 0, x1: 99, y1: 99 };
    const colony = { x: 50, y: 50 };
    const at = retreatPoint({ x: 53, y: 50 }, colony, bounds, () => true)!;
    expect(at.x).toBeGreaterThan(50 + CAMP.radius);
    // Blocked on that side: it takes another one
    const other = retreatPoint({ x: 53, y: 50 }, colony, bounds, (x) => x < 50)!;
    expect(other.x).toBeLessThan(50);
    expect(Math.hypot(other.x - 50, other.y - 50)).toBeGreaterThan(CAMP.radius);
    expect(retreatPoint({ x: 53, y: 50 }, colony, bounds, () => false)).toBeNull();
  });
});
