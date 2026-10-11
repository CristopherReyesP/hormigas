// World-space art for the Swarm's mycelium creep: a magenta fungal carpet with
// chartreuse veins over the surface around the nest. A tile still growing in
// shows loose hyphae threads; a solid tile shows the dithered mat, thinning
// out towards each side that borders bare ground so the carpet's edge frays
// instead of stepping tile by tile. Stamps are baked lazily per (kind, bare
// sides, variant) and cached; per frame a tile costs one drawImage.
// 1 art px = 2 px.

import { PAL, hash2 } from '../../engine/renderer/pixelart/palette';
import { PixelPainter } from '../../engine/renderer/pixelart/PixelPainter';
import { CREEP_SOLID, TILE_SIZE } from '../../shared/constants';
import type { CreepGrid } from '../../simulation/world/CreepGrid';

type Ctx = CanvasRenderingContext2D;

const ART = 2;
const N = TILE_SIZE / ART; // art px per tile side
const VARIANTS = 4;
/** Art px over which the mat thins out towards a bare side */
const FRAY = 9;
/** One stepped opacity for the whole carpet: the regolith still reads through it */
const CARPET_ALPHA = 0.7;

const FLESH = PAL.swarm.flesh;
const VEIN = PAL.swarm.vein;

/** Bare 4-neighbour sides of a solid tile, as a bit mask */
export const BARE = { N: 1, E: 2, S: 4, W: 8 } as const;

export type CreepTile = { readonly kind: 'threads' } | { readonly kind: 'mat'; readonly bare: number };

/** How a creep tile is drawn: threads while growing in, else the mat with its bare sides */
export function creepTile(creep: CreepGrid, x: number, y: number): CreepTile | null {
  const c = creep.get(x, y);
  if (c === 0) return null;
  if (c < CREEP_SOLID) return { kind: 'threads' };
  const bare = (nx: number, ny: number, bit: number) => (creep.get(nx, ny) >= CREEP_SOLID ? 0 : bit);
  return { kind: 'mat', bare: bare(x, y - 1, BARE.N) | bare(x + 1, y, BARE.E) | bare(x, y + 1, BARE.S) | bare(x - 1, y, BARE.W) };
}

/** Distance (art px) from (x, y) to the nearest bare side, Infinity when there is none */
function distToBare(bare: number, x: number, y: number): number {
  let d = Infinity;
  if (bare & BARE.N) d = Math.min(d, y);
  if (bare & BARE.E) d = Math.min(d, N - 1 - x);
  if (bare & BARE.S) d = Math.min(d, N - 1 - y);
  if (bare & BARE.W) d = Math.min(d, x);
  return d;
}

function bakeStamp(tile: CreepTile, variant: number): OffscreenCanvas {
  const c = new OffscreenCanvas(TILE_SIZE, TILE_SIZE);
  const p = new PixelPainter(c.getContext('2d')!, ART);
  const threadsOnly = tile.kind === 'threads';
  const bare = tile.kind === 'mat' ? tile.bare : 0;
  const seed = variant * 97 + (threadsOnly ? 1 : 3);
  const r = (i: number, j: number) => hash2(seed * 31 + i, seed * 17 + j);

  // Base mat: dense dither, thinning towards bare sides
  if (!threadsOnly) {
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const fade = Math.min(1, (distToBare(bare, x, y) + 1) / FRAY);
        if (r(x, y) >= 0.92 * fade) continue;
        p.px(x, y, (x + y) % 2 === 0 ? FLESH[0] : FLESH[1]);
      }
    }
  }

  // Hyphae threads: short random walks in the lighter flesh
  const threads = threadsOnly ? 2 : 3;
  for (let t = 0; t < threads; t++) {
    let x = Math.floor(r(t, 101) * N);
    let y = Math.floor(r(t, 202) * N);
    const len = 5 + Math.floor(r(t, 303) * 6);
    for (let s = 0; s < len; s++) {
      p.px(x, y, threadsOnly ? FLESH[1] : FLESH[2]);
      const turn = r(t * 7 + s, 404);
      if (turn < 0.4) x += 1; else if (turn < 0.6) x -= 1; else if (turn < 0.8) y += 1; else y -= 1;
      x = Math.max(0, Math.min(N - 1, x));
      y = Math.max(0, Math.min(N - 1, y));
    }
  }

  // A vein node deep in the mat: two dim pixels and one lit bead
  if (!threadsOnly) {
    const nx = 2 + Math.floor(r(9, 505) * (N - 5));
    const ny = 2 + Math.floor(r(9, 606) * (N - 5));
    if (distToBare(bare, nx, ny) >= FRAY / 2) {
      p.px(nx, ny, VEIN[0]);
      p.px(nx + 1, ny, VEIN[0]);
      if (bare === 0) p.px(nx, ny - 1, VEIN[1]);
    }
  }
  return c;
}

export class CreepArt {
  private stamps = new Map<number, OffscreenCanvas>();

  private stamp(tile: CreepTile, variant: number): OffscreenCanvas {
    // Threads: key 16; mat: its bare mask 0-15
    const key = (tile.kind === 'threads' ? 16 : tile.bare) * VARIANTS + variant;
    let s = this.stamps.get(key);
    if (!s) {
      s = bakeStamp(tile, variant);
      this.stamps.set(key, s);
    }
    return s;
  }

  /** Paint the creep on every explored tile in [startX, endX) × [startY, endY) (world transform set) */
  draw(
    ctx: Ctx,
    creep: CreepGrid,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    explored: (x: number, y: number) => boolean,
  ): void {
    ctx.save();
    ctx.globalAlpha = CARPET_ALPHA;
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const tile = creepTile(creep, x, y);
        if (tile === null || !explored(x, y)) continue;
        const variant = Math.floor(hash2(x, y) * VARIANTS);
        ctx.drawImage(this.stamp(tile, variant), x * TILE_SIZE, y * TILE_SIZE);
      }
    }
    ctx.restore();
  }
}
