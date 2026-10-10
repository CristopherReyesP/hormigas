import { describe, expect, it } from 'vitest';
import {
  MARCH_TUNING,
  columnInterval,
  columnSlot,
  compassVector,
  edgePoint,
  marchSpeedFactor,
  nearestWalkable,
  surfaceHoleFor,
  type SurfaceMap,
} from './waveMarch';

const open = (width = 120, height = 90, blocked: (x: number, y: number) => boolean = () => false): SurfaceMap => ({
  width,
  height,
  isWalkable: (x, y) => x >= 0 && y >= 0 && x < width && y < height && !blocked(x, y),
});

describe('where the wave leaves from', () => {
  it('the edge point lies on the map border along the direction', () => {
    const map = open();
    expect(edgePoint(map, { x: 60, y: 45 }, compassVector(4))).toEqual({ x: 1, y: 45 }); // west
    expect(edgePoint(map, { x: 60, y: 45 }, compassVector(0))).toEqual({ x: 118, y: 45 }); // east
    expect(edgePoint(map, { x: 60, y: 45 }, compassVector(2))).toEqual({ x: 60, y: 1 }); // north
    const ne = edgePoint(map, { x: 60, y: 45 }, compassVector(1));
    expect(ne.y).toBe(1);
    expect(ne.x).toBeGreaterThan(60);
  });

  it('steps off water at the edge onto the closest walkable tile', () => {
    const map = open(120, 90, (x) => x < 4);
    const p = edgePoint(map, { x: 60, y: 45 }, compassVector(4));
    expect(map.isWalkable(p.x, p.y)).toBe(true);
    expect(p.x).toBeLessThanOrEqual(6);
  });

  it('nearestWalkable finds the closest open tile', () => {
    const map = open(20, 20, (x, y) => x === 5 && y === 5);
    expect(nearestWalkable(map, 5, 5, 2)).not.toEqual({ x: 5, y: 5 });
    expect(nearestWalkable(map, 3, 3, 2)).toEqual({ x: 3, y: 3 });
  });
});

describe('surface holes map to the entrances below', () => {
  it('the main shaft is the nest tile; entrances west and east come up on that side of the mound', () => {
    const map = open();
    const nest = { x: 60, y: 45 };
    expect(surfaceHoleFor(map, { x: 44, y: 1 }, nest, 90)).toEqual(nest);
    const west = surfaceHoleFor(map, { x: 5, y: 1 }, nest, 90);
    const east = surfaceHoleFor(map, { x: 85, y: 1 }, nest, 90);
    expect(west.x).toBeLessThan(nest.x);
    expect(east.x).toBeGreaterThan(nest.x);
    expect(Math.abs(west.x - nest.x)).toBeLessThanOrEqual(MARCH_TUNING.holeSpread);
  });
});

describe('the column', () => {
  it('leaves over a few seconds whatever its size', () => {
    expect(columnInterval(3) * 3).toBeLessThanOrEqual(MARCH_TUNING.columnSeconds);
    expect(columnInterval(3)).toBe(MARCH_TUNING.maxInterval);
    expect(columnInterval(50) * 50).toBeLessThanOrEqual(MARCH_TUNING.columnSeconds * 2);
  });

  it('lanes sit side by side across the march', () => {
    const map = open();
    const slots = [0, 1, 2].map((i) => columnSlot(map, i, { x: 1, y: 45 }, { x: 60, y: 45 }));
    expect(new Set(slots.map((s) => s.y)).size).toBe(3);
    for (const s of slots) expect(s.x).toBe(1);
  });

  it('the march speed brings a far edge in within the night, never faster than the cap', () => {
    expect(marchSpeedFactor(5, 0.9)).toBe(1);
    const f = marchSpeedFactor(40, 0.9);
    expect(f).toBeGreaterThan(1);
    expect((40 * MARCH_TUNING.winding) / (0.9 * f)).toBeCloseTo(MARCH_TUNING.marchSeconds, 0);
    expect(marchSpeedFactor(1000, 0.9)).toBe(MARCH_TUNING.maxSpeedFactor);
  });
});
