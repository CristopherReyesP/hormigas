import { describe, expect, it } from 'vitest';
import { pickCraterSite, type CraterSiteInput } from './craterSite';
import { createSeededRng } from './MutationOffers';

const W = 60;
const H = 40;
const NEST = { x: 30, y: 20 };

/** Map built from a walkability predicate; everything outside the bounds is a wall. */
function input(walkable: (x: number, y: number) => boolean, seed = 1): CraterSiteInput {
  return {
    width: W,
    height: H,
    nest: NEST,
    isWalkable: (x, y) => x >= 0 && y >= 0 && x < W && y < H && walkable(x, y),
    rng: createSeededRng(seed),
    clearRadius: 2,
    edgeMargin: 3,
    farFraction: 0.75,
  };
}

const open = () => true;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe('pickCraterSite', () => {
  it('stays inside the edge margin', () => {
    const site = pickCraterSite(input(open));
    expect(site.x).toBeGreaterThanOrEqual(3);
    expect(site.y).toBeGreaterThanOrEqual(3);
    expect(site.x).toBeLessThan(W - 3);
    expect(site.y).toBeLessThan(H - 3);
  });

  it('lands on the far side of the map, away from the nest', () => {
    // Farthest legal clearing on this open map is a corner inside the margin
    const farthest = dist(NEST, { x: 3, y: 3 });
    for (let seed = 1; seed <= 20; seed++) {
      const site = pickCraterSite(input(open, seed));
      expect(dist(site, NEST)).toBeGreaterThanOrEqual(farthest * 0.75 - 1e-9);
    }
  });

  it('never picks a clearing the colony cannot walk to', () => {
    // A wall at x = 40 seals off the whole east side, which holds the far corners
    const walled = (x: number) => x !== 40;
    for (let seed = 1; seed <= 20; seed++) {
      const site = pickCraterSite(input(walled, seed));
      expect(site.x).toBeLessThan(40);
    }
  });

  it('keeps the whole clearing walkable around the impact', () => {
    // Scattered rocks: every 4th tile on a diagonal lattice is blocked
    const rocky = (x: number, y: number) => (x * 3 + y * 5) % 11 !== 0;
    const site = pickCraterSite(input(rocky, 7));
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (dx * dx + dy * dy <= 4) expect(rocky(site.x + dx, site.y + dy)).toBe(true);
      }
    }
  });

  it('is deterministic for a seed and varies across seeds', () => {
    const a = pickCraterSite(input(open, 42));
    const b = pickCraterSite(input(open, 42));
    expect(a).toEqual(b);
    const sites = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      const s = pickCraterSite(input(open, seed));
      sites.add(`${s.x},${s.y}`);
    }
    expect(sites.size).toBeGreaterThan(1);
  });

  it('falls back to the farthest reachable tile when no clearing exists', () => {
    // A 1-tile-wide horizontal corridor through the nest: no 2-radius clearing anywhere
    const corridor = (_x: number, y: number) => y === NEST.y;
    const site = pickCraterSite(input(corridor));
    expect(site.y).toBe(NEST.y);
    expect(Math.abs(site.x - NEST.x)).toBeGreaterThanOrEqual(25);
  });
});
