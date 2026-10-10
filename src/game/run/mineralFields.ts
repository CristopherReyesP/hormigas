/**
 * Where the colony finds minerals. Food pays for ants; minerals pay for
 * structures (P7). The crystal shards the meteorite scattered around its
 * crater are the first, natural field; a few more fields are seeded across
 * the map, one of them close enough to home to start mining early.
 *
 * Pure and seeded like `pickCraterSite`: the same seed and map give the same
 * fields, every node sits on ground the colony can walk to from the nest, and
 * no node lands inside the colony's starting clearing.
 */

import { floodFromNest, type TilePos } from './craterSite';

export interface MineralFieldInput {
  width: number;
  height: number;
  nest: TilePos;
  isWalkable: (x: number, y: number) => boolean;
  /** Seeded generator in [0, 1); the only source of variation */
  rng: () => number;
  /** The meteorite's impact tile; its shard ring is the natural field (null: no crater) */
  crater: TilePos | null;
  /** Natural field nodes sit in this ring around the crater: inner < distance <= outer */
  craterRing: { inner: number; outer: number };
  /** Seeded fields besides the natural one */
  extraFields: number;
  nodesPerField: number;
  /** Nodes of a seeded field sit within this radius of its center */
  fieldRadius: number;
  /** Every node is at least this far from the nest */
  minNestDistance: number;
  /** The first seeded field's center stays within this distance of the nest, when the map allows */
  homeFieldMaxDistance: number;
  /** Minimum distance between two field centers (the crater counts as one) */
  minFieldSpacing: number;
  /** Tiles kept between a seeded field's center and the map edge */
  edgeMargin: number;
}

export interface MineralField {
  center: TilePos;
  nodes: TilePos[];
  /** The crater's shard ring, rather than a seeded field */
  natural: boolean;
}

/** Take `count` items in a seeded order (partial Fisher-Yates on a copy). */
function seededPick<T>(items: T[], count: number, rng: () => number): T[] {
  const pool = items.slice();
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.min(pool.length - i - 1, Math.floor(rng() * (pool.length - i)));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

export function pickMineralFields(input: MineralFieldInput): MineralField[] {
  const { width, height, nest, rng, crater, craterRing, nodesPerField, fieldRadius: r, minNestDistance, edgeMargin: m } = input;
  const reached = floodFromNest(input);
  const used = new Set<number>();
  const isFree = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && reached[y * width + x] === 1 && !used.has(y * width + x);
  const nestDist = (x: number, y: number) => Math.hypot(x - nest.x, y - nest.y);
  const claim = (nodes: TilePos[]) => nodes.forEach((n) => used.add(n.y * width + n.x));

  const fields: MineralField[] = [];
  const centers: TilePos[] = [];

  // The natural field: reachable ground in the crater's shard ring
  if (crater) {
    centers.push(crater);
    const ring: TilePos[] = [];
    const outer = Math.floor(craterRing.outer);
    for (let y = crater.y - outer; y <= crater.y + outer; y++) {
      for (let x = crater.x - outer; x <= crater.x + outer; x++) {
        const d = Math.hypot(x - crater.x, y - crater.y);
        if (d <= craterRing.inner || d > craterRing.outer) continue;
        if (!isFree(x, y) || nestDist(x, y) < minNestDistance) continue;
        ring.push({ x, y });
      }
    }
    if (ring.length > 0) {
      const nodes = seededPick(ring, nodesPerField, rng);
      claim(nodes);
      fields.push({ center: { x: crater.x, y: crater.y }, nodes, natural: true });
    }
  }

  // Free reachable tiles within the field radius of a center
  const discAround = (cx: number, cy: number): TilePos[] => {
    const disc: TilePos[] = [];
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy <= r * r && isFree(cx + dx, cy + dy)) disc.push({ x: cx + dx, y: cy + dy });
      }
    }
    return disc;
  };

  for (let i = 0; i < input.extraFields; i++) {
    const candidates: TilePos[] = [];
    const nearHome: TilePos[] = [];
    for (let y = m; y < height - m; y++) {
      for (let x = m; x < width - m; x++) {
        if (!isFree(x, y)) continue;
        const d = nestDist(x, y);
        // The whole disc must clear the nest's keep-out radius
        if (d < minNestDistance + r) continue;
        if (centers.some((c) => Math.hypot(x - c.x, y - c.y) < input.minFieldSpacing)) continue;
        if (discAround(x, y).length < nodesPerField) continue;
        candidates.push({ x, y });
        if (d <= input.homeFieldMaxDistance) nearHome.push({ x, y });
      }
    }
    // The first seeded field is the home field: close by, when the map has room for it
    const pool = i === 0 && nearHome.length > 0 ? nearHome : candidates;
    if (pool.length === 0) break;
    const center = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
    const nodes = seededPick(discAround(center.x, center.y), nodesPerField, rng);
    claim(nodes);
    centers.push(center);
    fields.push({ center, nodes, natural: false });
  }

  return fields;
}
