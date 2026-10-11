// World-space art for the Swarm's mycelium creep: a magenta fungal carpet with
// chartreuse veins over the surface around the nest. A tile still growing in
// shows loose hyphae threads; a solid tile shows the dithered mat, thinning
// out towards each side that borders bare ground so the carpet's edge frays
// instead of stepping tile by tile. Stamps are baked lazily per (kind, bare
// sides, variant) and cached, and the carpet itself is cached per 8×8-tile
// chunk (see CreepArt).
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

/** Tiles per chunk side */
const CHUNK = 8;
/** Chunks repainted per frame at most: a burst of growth spreads over a few frames */
const MAX_REPAINTS_PER_FRAME = 8;

/** How a creep tile is drawn: 0 = nothing, 1 = threads (still growing in), 2 + bare 4-neighbour mask = mat */
function creepCode(creep: CreepGrid, x: number, y: number): number {
  const c = creep.get(x, y);
  if (c === 0) return 0;
  if (c < CREEP_SOLID) return 1;
  return 2
    + (creep.get(x, y - 1) >= CREEP_SOLID ? 0 : BARE.N)
    + (creep.get(x + 1, y) >= CREEP_SOLID ? 0 : BARE.E)
    + (creep.get(x, y + 1) >= CREEP_SOLID ? 0 : BARE.S)
    + (creep.get(x - 1, y) >= CREEP_SOLID ? 0 : BARE.W);
}

/**
 * The creep, cached in 8×8-tile chunks like the pheromone trails: a chunk's
 * picture is repainted only when one of its tiles changes how it is drawn (or
 * gets explored), so a frame blits a few dozen chunk canvases instead of one
 * stamp per carpet tile.
 */
export class CreepArt {
  private stamps = new Map<number, OffscreenCanvas>();
  private cols = 0;
  private rows = 0;
  private width = 0;
  /** Drawn code per tile (255 = never drawn) */
  private codes = new Uint8Array(0);
  private canvases: Array<OffscreenCanvas | null> = [];
  private filled = new Uint8Array(0);
  /** Per chunk, the tile box (chunk-local, inclusive) its picture covers: x0, y0, x1, y1 */
  private boxes = new Uint8Array(0);
  private dirty = new Uint8Array(0);

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

  private ensure(creep: CreepGrid): void {
    if (this.width === creep.width && this.codes.length === creep.width * creep.height) return;
    this.width = creep.width;
    this.cols = Math.ceil(creep.width / CHUNK);
    this.rows = Math.ceil(creep.height / CHUNK);
    this.codes = new Uint8Array(creep.width * creep.height).fill(255);
    this.canvases = new Array(this.cols * this.rows).fill(null);
    this.filled = new Uint8Array(this.cols * this.rows);
    this.boxes = new Uint8Array(this.cols * this.rows * 4);
    this.dirty = new Uint8Array(this.cols * this.rows).fill(1);
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
    this.ensure(creep);
    const c0 = Math.max(0, Math.floor(startX / CHUNK));
    const r0 = Math.max(0, Math.floor(startY / CHUNK));
    const c1 = Math.min(this.cols - 1, Math.floor((endX - 1) / CHUNK));
    const r1 = Math.min(this.rows - 1, Math.floor((endY - 1) / CHUNK));
    let repaints = 0;
    ctx.save();
    ctx.globalAlpha = CARPET_ALPHA;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const chunk = r * this.cols + c;
        if (this.scan(creep, explored, c, r)) this.dirty[chunk] = 1;
        if (this.dirty[chunk] && repaints < MAX_REPAINTS_PER_FRAME) {
          this.repaint(creep, c, r);
          repaints++;
        }
        const canvas = this.canvases[chunk];
        if (canvas && this.filled[chunk]) {
          // Only the box the carpet covers: an edge chunk is mostly bare ground
          const b = chunk * 4;
          const sx = this.boxes[b] * TILE_SIZE;
          const sy = this.boxes[b + 1] * TILE_SIZE;
          const sw = (this.boxes[b + 2] - this.boxes[b] + 1) * TILE_SIZE;
          const sh = (this.boxes[b + 3] - this.boxes[b + 1] + 1) * TILE_SIZE;
          ctx.drawImage(canvas, sx, sy, sw, sh, c * CHUNK * TILE_SIZE + sx, r * CHUNK * TILE_SIZE + sy, sw, sh);
        }
      }
    }
    ctx.restore();
  }

  /** Recompute the chunk's tile codes; true when any changed since it was last painted */
  private scan(creep: CreepGrid, explored: (x: number, y: number) => boolean, c: number, r: number): boolean {
    let changed = false;
    const x1 = Math.min(creep.width, (c + 1) * CHUNK);
    const y1 = Math.min(creep.height, (r + 1) * CHUNK);
    for (let y = r * CHUNK; y < y1; y++) {
      for (let x = c * CHUNK; x < x1; x++) {
        const code = creep.get(x, y) > 0 && explored(x, y) ? creepCode(creep, x, y) : 0;
        const i = y * this.width + x;
        if (this.codes[i] !== code) {
          this.codes[i] = code;
          changed = true;
        }
      }
    }
    return changed;
  }

  private repaint(creep: CreepGrid, c: number, r: number): void {
    const chunk = r * this.cols + c;
    this.dirty[chunk] = 0;
    const x1 = Math.min(creep.width, (c + 1) * CHUNK);
    const y1 = Math.min(creep.height, (r + 1) * CHUNK);
    let canvas = this.canvases[chunk];
    let any = false;
    let bx0 = CHUNK, by0 = CHUNK, bx1 = 0, by1 = 0;
    for (let y = r * CHUNK; y < y1; y++) {
      for (let x = c * CHUNK; x < x1; x++) {
        const code = this.codes[y * this.width + x];
        if (code === 0) continue;
        if (!any) {
          any = true;
          canvas ??= this.canvases[chunk] = new OffscreenCanvas(CHUNK * TILE_SIZE, CHUNK * TILE_SIZE);
          canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
        }
        const lx = x - c * CHUNK;
        const ly = y - r * CHUNK;
        if (lx < bx0) bx0 = lx;
        if (lx > bx1) bx1 = lx;
        if (ly < by0) by0 = ly;
        if (ly > by1) by1 = ly;
        const tile: CreepTile = code === 1 ? { kind: 'threads' } : { kind: 'mat', bare: code - 2 };
        const variant = Math.floor(hash2(x, y) * VARIANTS);
        canvas!.getContext('2d')!.drawImage(this.stamp(tile, variant), lx * TILE_SIZE, ly * TILE_SIZE);
      }
    }
    this.filled[chunk] = any ? 1 : 0;
    this.boxes.set([bx0, by0, bx1, by1], chunk * 4);
  }
}
