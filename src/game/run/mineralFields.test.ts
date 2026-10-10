import { describe, expect, it } from 'vitest';
import { pickMineralFields, type MineralFieldInput } from './mineralFields';
import { createSeededRng } from './MutationOffers';

const W = 80;
const H = 60;
const NEST = { x: 40, y: 30 };
const CRATER = { x: 70, y: 10 };

function input(walkable: (x: number, y: number) => boolean, seed = 1, crater: { x: number; y: number } | null = CRATER): MineralFieldInput {
  return {
    width: W,
    height: H,
    nest: NEST,
    isWalkable: (x, y) => x >= 0 && y >= 0 && x < W && y < H && walkable(x, y),
    rng: createSeededRng(seed),
    crater,
    craterRing: { inner: 2, outer: 6 },
    extraFields: 3,
    nodesPerField: 5,
    fieldRadius: 2,
    minNestDistance: 12,
    homeFieldMaxDistance: 22,
    minFieldSpacing: 12,
    edgeMargin: 3,
  };
}

const open = () => true;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** Tiles reachable from the nest over walkable ground (4-connected), as "x,y" keys. */
function reachable(walkable: (x: number, y: number) => boolean): Set<string> {
  const seen = new Set<string>([`${NEST.x},${NEST.y}`]);
  const queue = [NEST];
  while (queue.length > 0) {
    const { x, y } = queue.shift()!;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      const key = `${nx},${ny}`;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen.has(key) || !walkable(nx, ny)) continue;
      seen.add(key);
      queue.push({ x: nx, y: ny });
    }
  }
  return seen;
}

describe('pickMineralFields', () => {
  it('is deterministic for a seed and varies across seeds', () => {
    const a = pickMineralFields(input(open, 42));
    const b = pickMineralFields(input(open, 42));
    expect(a).toEqual(b);
    const layouts = new Set<string>();
    for (let seed = 1; seed <= 10; seed++) layouts.add(JSON.stringify(pickMineralFields(input(open, seed))));
    expect(layouts.size).toBeGreaterThan(1);
  });

  it('marks the crater ring as the first, natural field', () => {
    const [natural, ...rest] = pickMineralFields(input(open));
    expect(natural.natural).toBe(true);
    expect(natural.center).toEqual(CRATER);
    expect(natural.nodes).toHaveLength(5);
    for (const node of natural.nodes) {
      const d = dist(node, CRATER);
      expect(d).toBeGreaterThan(2);
      expect(d).toBeLessThanOrEqual(6);
    }
    expect(rest.every((f) => !f.natural)).toBe(true);
  });

  it('places the requested number of fields, each with its nodes', () => {
    const fields = pickMineralFields(input(open));
    expect(fields).toHaveLength(4);
    for (const field of fields) expect(field.nodes).toHaveLength(5);
  });

  it('keeps every node away from the nest', () => {
    for (let seed = 1; seed <= 10; seed++) {
      for (const field of pickMineralFields(input(open, seed))) {
        for (const node of field.nodes) expect(dist(node, NEST)).toBeGreaterThanOrEqual(12);
      }
    }
  });

  it('puts one field within reach of home so mining can start early', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const home = pickMineralFields(input(open, seed))[1];
      expect(dist(home.center, NEST)).toBeLessThanOrEqual(22);
    }
  });

  it('spreads fields apart and never stacks two nodes on one tile', () => {
    const fields = pickMineralFields(input(open, 3));
    for (let i = 0; i < fields.length; i++) {
      for (let j = i + 1; j < fields.length; j++) {
        expect(dist(fields[i].center, fields[j].center)).toBeGreaterThanOrEqual(12);
      }
    }
    const tiles = fields.flatMap((f) => f.nodes.map((n) => `${n.x},${n.y}`));
    expect(new Set(tiles).size).toBe(tiles.length);
  });

  it('only puts nodes on ground the colony can walk to', () => {
    // A wall at x = 60 seals off the east side (and the crater); scattered rocks elsewhere
    const walled = (x: number, y: number) => x !== 60 && (x * 3 + y * 5) % 11 !== 0;
    const reach = reachable(walled);
    for (let seed = 1; seed <= 10; seed++) {
      const fields = pickMineralFields(input(walled, seed));
      expect(fields.length).toBeGreaterThan(0);
      for (const field of fields) {
        for (const node of field.nodes) expect(reach.has(`${node.x},${node.y}`)).toBe(true);
      }
    }
  });

  it('skips the natural field when the crater ring cannot be reached', () => {
    const walled = (x: number) => x !== 60;
    const fields = pickMineralFields(input(walled));
    expect(fields.some((f) => f.natural)).toBe(false);
  });

  it('works without a crater', () => {
    const fields = pickMineralFields(input(open, 1, null));
    expect(fields).toHaveLength(3);
    expect(fields.some((f) => f.natural)).toBe(false);
  });
});
