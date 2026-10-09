import { TerrainType } from '../../simulation/world/types';

/**
 * Where the alien world's decorations go. Pure placement data (art-pixel
 * anchors inside a 16×16 tile): the renderers paint it once into their cached
 * canvases. Everything derives from tile coords + seed, never Math.random, so
 * a tile always grows the same prop and nothing flickers between frames.
 */

/** Art pixels per tile side (matches TerrainRenderer / FoliageOverlay). */
const ART = 16;

/** Seed the renderers use for terrain decorations. */
export const DECOR_SEED = 0x51a7;

/** 32-bit integer avalanche (Math.imul keeps every bit; no float precision loss). */
function mix(a: number): number {
  a = Math.imul(a ^ (a >>> 16), 0x7feb352d);
  a = Math.imul(a ^ (a >>> 15), 0x846ca68b);
  return (a ^ (a >>> 16)) >>> 0;
}

/** Deterministic [0, 1) value for a tile, seed and salt; salts are independent. */
export function decorRand(x: number, y: number, seed: number, salt: number): number {
  let h = mix(x | 0);
  h = mix(h ^ Math.imul(y | 0, 0x9e3779b1));
  h = mix(h ^ Math.imul(seed | 0, 0x85ebca6b));
  h = mix(h ^ Math.imul(salt | 0, 0xc2b2ae35));
  return h / 4294967296;
}

/**
 * Smooth value noise in [0, 1): lattice values every `cell` tiles, blended
 * with smoothstep, so neighbouring tiles differ by at most 1.5 / cell.
 * Gives the ground large soft patches instead of per-tile salt and pepper.
 */
export function patchNoise(x: number, y: number, seed: number, cell: number): number {
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  const fx = x / cell - gx;
  const fy = y / cell - gy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const top = decorRand(gx, gy, seed, 21) * (1 - sx) + decorRand(gx + 1, gy, seed, 21) * sx;
  const bottom = decorRand(gx, gy + 1, seed, 21) * (1 - sx) + decorRand(gx + 1, gy + 1, seed, 21) * sx;
  return top * (1 - sy) + bottom * sy;
}

export type FloraKind = 'podStalk' | 'fungalFan';

export interface FloraProp {
  kind: FloraKind;
  /** Art-pixel anchor: the prop's base, inside the tile */
  ax: number;
  ay: number;
  /** Stalk height (podStalk) or fan width (fungalFan), in art px */
  size: number;
  /** Glowing pods on a stalk (1-3); 0 for fans */
  pods: number;
  /** Mirror the prop horizontally */
  flip: boolean;
}

/** Chance a tile grows a prop: moss is lush, regolith barren, the rest bare. */
const FLORA_DENSITY: Partial<Record<TerrainType, number>> = {
  [TerrainType.Grass]: 0.17,
  [TerrainType.Dirt]: 0.05,
};

/** The alien prop growing on this tile, or null for bare ground. */
export function floraAt(x: number, y: number, terrain: TerrainType, seed: number): FloraProp | null {
  const density = FLORA_DENSITY[terrain] ?? 0;
  if (decorRand(x, y, seed, 1) >= density) return null;

  const stalk = decorRand(x, y, seed, 2) < (terrain === TerrainType.Grass ? 0.6 : 0.45);
  const size = stalk
    ? 4 + Math.floor(decorRand(x, y, seed, 3) * 5) // 4-8 px tall
    : 4 + Math.floor(decorRand(x, y, seed, 3) * 4); // 4-7 px wide
  const ax = 3 + Math.floor(decorRand(x, y, seed, 4) * (ART - 6)); // 3..12
  const minY = size + 1;
  const ay = minY + Math.floor(decorRand(x, y, seed, 5) * (ART - 2 - minY + 1));
  return {
    kind: stalk ? 'podStalk' : 'fungalFan',
    ax,
    ay: Math.min(ART - 2, ay),
    size,
    pods: stalk ? 1 + Math.floor(decorRand(x, y, seed, 6) * 3) : 0,
    flip: decorRand(x, y, seed, 7) < 0.5,
  };
}

/** Corruption reach of the Crystal Hive around the crater, in tiles. */
export const CRYSTAL_SHARD_RADIUS = 6;
/** Tiles covered by the crater bowl itself (no shards inside it). */
export const CRYSTAL_BOWL_RADIUS = 2;

export interface CrystalShard {
  tileX: number;
  tileY: number;
  /** Art-pixel base of the shard inside its tile */
  ax: number;
  ay: number;
  /** Shard height in art px */
  height: number;
  /** -1 leans left, 0 upright, 1 leans right */
  lean: -1 | 0 | 1;
  /** A smaller shard grows beside this one */
  twin: boolean;
}

/**
 * Crystal shards poking out of the ground around the crater: dense by the rim,
 * thinning out to nothing at CRYSTAL_SHARD_RADIUS, only on ground tiles.
 */
export function crystalShardsAround(
  center: { x: number; y: number },
  seed: number,
  isGround: (x: number, y: number) => boolean,
  radius = CRYSTAL_SHARD_RADIUS,
): CrystalShard[] {
  const shards: CrystalShard[] = [];
  const r = Math.floor(radius);
  for (let y = center.y - r; y <= center.y + r; y++) {
    for (let x = center.x - r; x <= center.x + r; x++) {
      const d = Math.hypot(x - center.x, y - center.y);
      if (d <= CRYSTAL_BOWL_RADIUS || d > radius) continue;
      if (!isGround(x, y)) continue;
      // Linear falloff from the rim (0.85) to the edge of the corruption (0.1)
      const t = (d - CRYSTAL_BOWL_RADIUS) / (radius - CRYSTAL_BOWL_RADIUS);
      if (decorRand(x, y, seed, 11) >= 0.85 - 0.75 * t) continue;
      const height = 3 + Math.floor(decorRand(x, y, seed, 12) * (t < 0.5 ? 7 : 4)); // tall by the rim
      const lean = Math.floor(decorRand(x, y, seed, 13) * 3) - 1;
      shards.push({
        tileX: x,
        tileY: y,
        ax: 3 + Math.floor(decorRand(x, y, seed, 14) * (ART - 6)),
        ay: height + 2 + Math.floor(decorRand(x, y, seed, 15) * (ART - 4 - height)),
        height,
        lean: lean as -1 | 0 | 1,
        twin: decorRand(x, y, seed, 16) < 0.6 - 0.4 * t,
      });
    }
  }
  return shards;
}
