import { describe, expect, it } from 'vitest';
import { DOMINION_TARGET, densInside, dominionScore, frontierHint, frontierReady, measureTerritory, type FrontierProgress } from './frontierProgress';

const progress = (over: Partial<FrontierProgress> = {}): FrontierProgress => ({
  phase: 1, dominion: 0, target: DOMINION_TARGET, territory: 0, densDestroyed: 0, densAlive: 0,
  coreNeeded: true, coreDestroyed: false, ...over,
});

describe('dominion', () => {
  it('weighs the explored ground and the dens destroyed', () => {
    expect(dominionScore(0, 0, 2)).toBe(0);
    expect(dominionScore(1, 2, 0)).toBe(1);
    expect(dominionScore(0.5, 1, 1)).toBeCloseTo(0.6 * 0.5 + 0.4 * 0.5);
  });

  it('counts a map without dens as all of them cleared', () => {
    expect(dominionScore(0, 0, 0)).toBeCloseTo(0.4);
  });

  it('measures the explored share of the walkable ground inside the bounds only', () => {
    const grid = { getTile: (x: number) => ({ walkable: x !== 1 }) };
    // Bounds x 0..3: 3 walkable (0, 2, 3), of which 0 and 2 explored
    const share = measureTerritory(grid, { x0: 0, y0: 0, x1: 3, y1: 0 }, (x) => x === 0 || x === 2 || x === 9);
    expect(share).toBeCloseTo(2 / 3);
  });

  it('counts only the dens inside the zone', () => {
    expect(densInside({ x0: 10, y0: 10, x1: 20, y1: 20 }, [{ x: 15, y: 15 }, { x: 5, y: 15 }, { x: 20.2, y: 19.6 }])).toBe(2);
  });
});

describe('when the frontier opens', () => {
  it('needs the rival core destroyed AND the dominion target', () => {
    expect(frontierReady(progress({ dominion: 0.9 }))).toBe(false);
    expect(frontierReady(progress({ coreDestroyed: true, dominion: 0.5 }))).toBe(false);
    expect(frontierReady(progress({ coreDestroyed: true, dominion: DOMINION_TARGET }))).toBe(true);
  });

  it('needs only the dominion when the run has no rival core (Fauna salvaje)', () => {
    expect(frontierReady(progress({ coreNeeded: false, dominion: 0.8 }))).toBe(true);
  });

  it('never opens twice', () => {
    expect(frontierReady(progress({ phase: 2, coreDestroyed: true, dominion: 1 }))).toBe(false);
  });

  it('tells the player what is still missing', () => {
    expect(frontierHint(progress())).toContain('destruye el núcleo rival');
    expect(frontierHint(progress())).toContain('75%');
    expect(frontierHint(progress({ coreDestroyed: true, dominion: 0.8 }))).not.toContain('núcleo');
    expect(frontierHint(progress({ phase: 2 }))).toContain('Reina Legionaria');
  });
});
