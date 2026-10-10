import { describe, expect, it } from 'vitest';
import { UndergroundGrid } from '../../simulation/world/UndergroundGrid';
import { ENTRANCE_ROW } from '../../shared/constants';
import { DEFENSE_AREA, DEFENSE_STATS, checkPlacement, type PlacementQuery } from './defenses';

const W = 30;
const H = 30;
const HOME = { x: 15, y: 15 };

/** An open 30×30 field around the nest, with optional blocked tiles */
function field(blocked: Array<[number, number]> = [], occupied: Array<[number, number]> = []) {
  const walls = new Set(blocked.map(([x, y]) => y * W + x));
  const taken = new Set(occupied.map(([x, y]) => y * W + x));
  return {
    width: W,
    height: H,
    isWalkable: (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && !walls.has(y * W + x),
    isOccupied: (x: number, y: number) => taken.has(y * W + x),
    home: HOME,
    anchors: [HOME],
    areaRadius: DEFENSE_AREA.surfaceRadius,
    keepClear: DEFENSE_AREA.nestClear,
  };
}

const query = (over: Partial<PlacementQuery> & Pick<PlacementQuery, 'kind' | 'x' | 'y'>, base = field()): PlacementQuery => ({
  minerals: 999,
  ...base,
  ...over,
});

/** A ring of rock at Chebyshev radius 4 around the nest, open only at (19, 15) */
function ringWithGap(): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let y = HOME.y - 4; y <= HOME.y + 4; y++) {
    for (let x = HOME.x - 4; x <= HOME.x + 4; x++) {
      if (Math.max(Math.abs(x - HOME.x), Math.abs(y - HOME.y)) !== 4) continue;
      if (x === 19 && y === 15) continue;
      out.push([x, y]);
    }
  }
  return out;
}

describe('defense costs and stats', () => {
  it('prices the three defenses in minerals, the spine dearest and the wall cheapest', () => {
    expect(DEFENSE_STATS.spine.cost).toBe(75);
    expect(DEFENSE_STATS.trap.cost).toBe(40);
    expect(DEFENSE_STATS.wall.cost).toBe(30);
    expect(DEFENSE_STATS.spine.name).toBe('Espina');
    expect(DEFENSE_STATS.trap.name).toBe('Trampa de resina');
    expect(DEFENSE_STATS.wall.name).toBe('Muro de quitina');
    expect(DEFENSE_STATS.wall.health).toBeGreaterThan(DEFENSE_STATS.spine.health);
    expect(DEFENSE_STATS.spine.range).toBeGreaterThan(3);
    expect(DEFENSE_STATS.trap.slow).toBeLessThan(1);
  });
});

describe('defense placement rules', () => {
  it('accepts a free, walkable tile near the nest', () => {
    expect(checkPlacement(query({ kind: 'spine', x: 19, y: 15 }))).toEqual({ ok: true });
  });

  it('refuses when the minerals bank cannot pay', () => {
    const result = checkPlacement(query({ kind: 'spine', x: 19, y: 15, minerals: 74 }));
    expect(result).toMatchObject({ ok: false, reason: 'minerals' });
    expect(checkPlacement(query({ kind: 'wall', x: 19, y: 15, minerals: 30 })).ok).toBe(true);
  });

  it('refuses tiles outside the build area, and the nest mound itself', () => {
    expect(checkPlacement(query({ kind: 'trap', x: HOME.x + DEFENSE_AREA.surfaceRadius + 1, y: 15 }))).toMatchObject({ ok: false, reason: 'area' });
    expect(checkPlacement(query({ kind: 'trap', x: HOME.x + 1, y: 15 }))).toMatchObject({ ok: false, reason: 'area' });
  });

  it('refuses rock and water, and tiles another defense already takes', () => {
    expect(checkPlacement(query({ kind: 'spine', x: 19, y: 15 }, field([[19, 15]])))).toMatchObject({ ok: false, reason: 'blocked' });
    expect(checkPlacement(query({ kind: 'spine', x: 19, y: 15 }, field([], [[19, 15]])))).toMatchObject({ ok: false, reason: 'occupied' });
  });

  it('refuses a wall that would seal the nest, but a spine may stand in the gap', () => {
    const ring = field(ringWithGap());
    const wall = checkPlacement(query({ kind: 'wall', x: 19, y: 15 }, ring));
    expect(wall).toMatchObject({ ok: false, reason: 'seal' });
    expect(wall.ok ? '' : wall.message).toMatch(/sellar/);
    expect(checkPlacement(query({ kind: 'spine', x: 19, y: 15 }, ring)).ok).toBe(true);
    expect(checkPlacement(query({ kind: 'wall', x: 17, y: 15 }, ring)).ok).toBe(true);
  });

  it('refuses a wall that would cut off a pocket of ground', () => {
    // A dead-end alcove at (21..22, 15) reached only through (20, 15)
    const blocked: Array<[number, number]> = [[20, 14], [21, 14], [22, 14], [23, 15], [20, 16], [21, 16], [22, 16]];
    const map = field(blocked);
    expect(checkPlacement(query({ kind: 'wall', x: 20, y: 15 }, map))).toMatchObject({ ok: false, reason: 'seal' });
    expect(checkPlacement(query({ kind: 'trap', x: 20, y: 15 }, map)).ok).toBe(true);
  });

  it('underground: walls go on tunnels near an entrance and may never cut the queen off from the surface', () => {
    const grid = new UndergroundGrid();
    const entrances = grid.getEntrances();
    const queen = { x: Math.floor(grid.width / 2), y: Math.floor(grid.height / 2) };
    const walled = new Set<number>();
    const q = (kind: 'wall' | 'spine', x: number, y: number): PlacementQuery => ({
      kind, x, y, minerals: 999,
      width: grid.width,
      height: grid.height,
      isWalkable: (tx, ty) => grid.isWalkable(tx, ty) && !walled.has(ty * grid.width + tx),
      isOccupied: (tx, ty) => walled.has(ty * grid.width + tx),
      home: queen,
      anchors: entrances,
      areaRadius: DEFENSE_AREA.breachRadius,
      canWall: (_tx, ty) => ty !== ENTRANCE_ROW,
    });
    const shaft = entrances[0];
    expect(checkPlacement(q('wall', shaft.x, ENTRANCE_ROW))).toMatchObject({ ok: false, reason: 'blocked' });
    expect(checkPlacement(q('wall', shaft.x, 5))).toEqual({ ok: true });
    walled.add(5 * grid.width + shaft.x);
    // The 2-wide shaft is now 1 wide at row 5: walling the other half seals the nest
    expect(checkPlacement(q('wall', shaft.x + 1, 5))).toMatchObject({ ok: false, reason: 'seal' });
    // Far from every entrance is not a breach tile
    expect(checkPlacement(q('spine', queen.x + 3, queen.y))).toMatchObject({ ok: false, reason: 'area' });
  });
});
