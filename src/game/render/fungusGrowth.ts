// Fungus farm growth: what a farm tile LOOKS like, read straight from the
// simulation. A tile's stage comes from its real mushroom pile against the
// per-tile capacity (FungusFarmSystem grows piles; harvesters and eaters take
// from them), so the field on screen is always the economy's truth.
//
// Pure state, no canvas: the renderer (fungusFarmArt) draws from these.

/** Growth stages a farm tile walks through as its mushroom pile fills. */
export const FarmStage = {
  /** Empty or a few crumbs: spores and pale mycelium threads on the bed */
  Spores: 0,
  /** Small sprouts poking out of the furrows */
  Sprouts: 1,
  /** Caps opening, still small */
  Caps: 2,
  /** Mature glowing mushrooms with gills */
  Mature: 3,
  /** A full tile: mature mushrooms with a ready-to-harvest sparkle */
  Ready: 4,
} as const;
export type FarmStage = typeof FarmStage[keyof typeof FarmStage];

export const FARM_STAGE_COUNT = 5;

/** Fill thresholds (amount / capacity) where each stage starts */
const SPROUTS_FROM = 0.08;
const CAPS_FROM = 0.35;
const MATURE_FROM = 0.7;
const READY_EPSILON = 1e-6;

/** Fraction of a tile's capacity grown, clamped to 0..1 (0 when the capacity is unknown) */
export function farmGrowthProgress(amount: number, capacity: number): number {
  if (!(capacity > 0)) return 0;
  return Math.max(0, Math.min(1, amount / capacity));
}

/** A full tile is ripe: harvesters only pick ripe tiles */
export function isFarmTileReady(amount: number, capacity: number): boolean {
  return capacity > 0 && amount >= capacity - READY_EPSILON;
}

export function farmGrowthStage(amount: number, capacity: number): FarmStage {
  if (isFarmTileReady(amount, capacity)) return FarmStage.Ready;
  const p = farmGrowthProgress(amount, capacity);
  if (p >= MATURE_FROM) return FarmStage.Mature;
  if (p >= CAPS_FROM) return FarmStage.Caps;
  if (p >= SPROUTS_FROM) return FarmStage.Sprouts;
  return FarmStage.Spores;
}

/** Info card line for one farm tile */
export function farmTileStatusLabel(amount: number, capacity: number): string {
  if (isFarmTileReady(amount, capacity)) return 'Granja de hongos · lista para cosechar';
  return `Granja de hongos · madurando ${Math.floor(farmGrowthProgress(amount, capacity) * 100)}%`;
}

export interface FarmTileVariant {
  /** Crop offset inside the tile, in art pixels (-1..1) */
  dx: number;
  dy: number;
  /** Which of the three baked crop layouts this tile uses */
  shape: 0 | 1 | 2;
  /** Mirror the crop horizontally */
  flip: boolean;
  /** Animation phase 0..1 so neighbours do not sway in lockstep */
  phase: number;
}

/** Integer hash → 0..1 (same family as the terrain decorators' hash2) */
function hash01(x: number, y: number, salt: number): number {
  let h = (x * 374761393 + y * 668265263 + salt * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Leaf scraps shown on a farm bed for its mulch (0 bare … MULCH_SCRAPS fully mulched) */
export const MULCH_SCRAPS = 6;
export function mulchScrapCount(mulch: number, capacity: number): number {
  if (!(capacity > 0) || !(mulch > 0)) return 0;
  return Math.max(1, Math.min(MULCH_SCRAPS, Math.ceil((mulch / capacity) * MULCH_SCRAPS)));
}

/** Small deterministic per-tile variation, seeded by the tile coordinates */
export function farmTileVariant(x: number, y: number): FarmTileVariant {
  return {
    dx: Math.floor(hash01(x, y, 1) * 3) - 1,
    dy: Math.floor(hash01(x, y, 2) * 3) - 1,
    shape: Math.floor(hash01(x, y, 3) * 3) as 0 | 1 | 2,
    flip: hash01(x, y, 4) < 0.5,
    phase: hash01(x, y, 5),
  };
}

/** Seconds the growth pop lasts after a tile advances a stage */
export const GROWTH_POP_SECONDS = 0.4;
/** Seconds the pluck (cap shrinks, crumbs fly) plays after a harvest */
export const HARVEST_FX_SECONDS = 1;

export interface HarvestFx {
  x: number;
  y: number;
  /** 0 at the pluck, 1 when it ends */
  t: number;
}

/**
 * Per-tile animation memory: the last stage seen (to pop on growth) and the
 * running harvest plucks. Times are seconds on the renderer's clock.
 */
export class FarmAnimState {
  private stages = new Map<number, { stage: FarmStage; popAt: number }>();
  private plucks: Array<{ x: number; y: number; at: number }> = [];
  private readonly fx: HarvestFx[] = [];

  private static key(x: number, y: number): number {
    return y * 4096 + x;
  }

  /** Record the stage drawn this frame; a step UP starts a growth pop */
  observe(x: number, y: number, stage: FarmStage, now: number): void {
    const key = FarmAnimState.key(x, y);
    const seen = this.stages.get(key);
    if (!seen) {
      this.stages.set(key, { stage, popAt: -Infinity });
      return;
    }
    if (stage > seen.stage) seen.popAt = now;
    seen.stage = stage;
  }

  /** 1 right after a stage-up, easing to 0 over GROWTH_POP_SECONDS */
  popAmount(x: number, y: number, now: number): number {
    const seen = this.stages.get(FarmAnimState.key(x, y));
    if (!seen) return 0;
    const age = now - seen.popAt;
    if (age < 0 || age >= GROWTH_POP_SECONDS) return 0;
    return 1 - age / GROWTH_POP_SECONDS;
  }

  /** Start a pluck on a tile, unless one is already playing there */
  noteHarvest(x: number, y: number, now: number): void {
    if (this.isHarvesting(x, y, now)) return;
    if (this.plucks.length >= 32) this.harvests(now); // drop finished plucks nobody drew (layer out of view)
    this.plucks.push({ x, y, at: now });
  }

  isHarvesting(x: number, y: number, now: number): boolean {
    for (const p of this.plucks) {
      if (p.x === x && p.y === y && now - p.at < HARVEST_FX_SECONDS && now >= p.at) return true;
    }
    return false;
  }

  /** The plucks playing now (expired ones are dropped). The array is reused. */
  harvests(now: number): readonly HarvestFx[] {
    this.fx.length = 0;
    let w = 0;
    for (const p of this.plucks) {
      const age = now - p.at;
      if (age >= HARVEST_FX_SECONDS) continue;
      this.plucks[w++] = p;
      if (age >= 0) this.fx.push({ x: p.x, y: p.y, t: age / HARVEST_FX_SECONDS });
    }
    this.plucks.length = w;
    return this.fx;
  }
}

/** Which sprite rides on an ant's back for its load */
export function carriedFoodSprite(resourceType: string | null | undefined): 'mushroom' | 'leaf' | 'chunk' | null {
  if (!resourceType) return null;
  if (resourceType === 'mushroom' || resourceType === 'giant_mushroom') return 'mushroom';
  if (resourceType === 'leaf') return 'leaf';
  return 'chunk';
}
