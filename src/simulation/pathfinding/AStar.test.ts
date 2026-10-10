import { describe, expect, it } from 'vitest';
import type { Vector2 } from '../../shared/types';
import { createSeededRng } from '../../game/run/MutationOffers';
import { findPath, type PathGrid } from './AStar';
import { referenceFindPath } from './referenceAStar';

/** Plain boolean grid; out of bounds is solid, like TileGrid. */
function grid(width: number, height: number, solid: (x: number, y: number) => boolean): PathGrid {
  const cells = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) cells[y * width + x] = solid(x, y) ? 0 : 1;
  }
  return {
    width,
    height,
    isWalkable: (x, y) => x >= 0 && y >= 0 && x < width && y < height && cells[y * width + x] === 1,
  };
}

function randomGrid(seed: number, width: number, height: number, wallChance: number): PathGrid {
  const rng = createSeededRng(seed);
  return grid(width, height, () => rng() < wallChance);
}

/** Walls every 4 columns with one gap each, alternating top and bottom: long detours. */
function serpentine(width: number, height: number): PathGrid {
  return grid(width, height, (x, y) => x % 4 === 2 && (Math.floor(x / 4) % 2 === 0 ? y !== height - 1 : y !== 0));
}

function cost(path: Vector2[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const diagonal = path[i].x !== path[i - 1].x && path[i].y !== path[i - 1].y;
    total += diagonal ? 1.414 : 1;
  }
  return total;
}

function randomWalkable(g: PathGrid, rng: () => number): Vector2 {
  for (;;) {
    const x = Math.floor(rng() * g.width);
    const y = Math.floor(rng() * g.height);
    if (g.isWalkable(x, y)) return { x, y };
  }
}

function expectSameRoutes(g: PathGrid, seed: number, pairs: number, maxSteps?: number): number {
  const rng = createSeededRng(seed);
  let found = 0;
  for (let i = 0; i < pairs; i++) {
    const start = randomWalkable(g, rng);
    const end = randomWalkable(g, rng);
    const expected = referenceFindPath(g, start, end, maxSteps);
    const actual = findPath(g, start, end, maxSteps);
    expect(actual).toEqual(expected);
    if (expected) {
      found++;
      expect(cost(actual!)).toBe(cost(expected));
    }
  }
  return found;
}

describe('binary-heap A* matches the linear open-list A* it replaced', () => {
  it('returns the same routes on an open field', () => {
    const g = grid(40, 30, () => false);
    expect(expectSameRoutes(g, 1, 60)).toBe(60);
  });

  it('returns the same routes on scattered rocks (several densities)', () => {
    for (const [seed, density] of [[7, 0.15], [11, 0.3], [23, 0.4]] as const) {
      const g = randomGrid(seed, 48, 36, density);
      expectSameRoutes(g, seed * 3, 80);
    }
  });

  it('returns the same routes through a serpentine of walls', () => {
    const g = serpentine(41, 21);
    expect(expectSameRoutes(g, 5, 40)).toBeGreaterThan(30);
  });

  it('gives up on the same step budget', () => {
    const g = serpentine(41, 21);
    const start = { x: 0, y: 0 };
    const end = { x: 40, y: 20 };
    expect(findPath(g, start, end, 50)).toBeNull();
    expect(referenceFindPath(g, start, end, 50)).toBeNull();
    expectSameRoutes(randomGrid(99, 60, 40, 0.3), 42, 60, 150);
  });

  it('refuses an unwalkable goal and handles start == goal', () => {
    const g = grid(10, 10, (x, y) => x === 5 && y === 5);
    expect(findPath(g, { x: 0, y: 0 }, { x: 5, y: 5 })).toBeNull();
    expect(findPath(g, { x: 3, y: 3 }, { x: 3, y: 3 })).toEqual([{ x: 3, y: 3 }]);
  });

  it('rounds fractional start and goal positions the same way', () => {
    const g = randomGrid(3, 30, 20, 0.2);
    const rng = createSeededRng(77);
    for (let i = 0; i < 30; i++) {
      const s = randomWalkable(g, rng);
      const e = randomWalkable(g, rng);
      const start = { x: s.x + 0.3, y: s.y - 0.4 };
      const end = { x: e.x - 0.2, y: e.y + 0.45 };
      expect(findPath(g, start, end)).toEqual(referenceFindPath(g, start, end));
    }
  });
});
