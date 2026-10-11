import { PHEROMONE_MAX, TILE_SIZE } from '../../shared/constants';

/** What the layer reads per tile: the three scent strengths */
interface ScentTile {
  homePheromone: number;
  foodPheromone: number;
  dangerPheromone: number;
}

export interface ScentGrid {
  readonly width: number;
  readonly height: number;
  getTile(x: number, y: number): ScentTile | null;
}

export interface ExploredGrid {
  isExplored(x: number, y: number): boolean;
}

/**
 * Stamps per type: 3 intensity levels (weak, medium, strong), each optionally
 * in several variants laid out level by level ([w0, w1, …, m0, m1, …, s0, …]).
 * Tiles pick a variant by position, so neighbouring tiles never repeat.
 */
export type PheromoneStamps = Record<'home' | 'food' | 'danger', CanvasImageSource[]>;

/** Tiles per chunk side */
const CHUNK = 8;
/** Chunks repainted per frame at most: a burst of change spreads over a few frames */
const MAX_REPAINTS_PER_FRAME = 8;

/** 0 = no stamp, 1..3 = the stamp level drawn (same thresholds as the per-tile renderer) */
function level(value: number): number {
  if (value <= 1) return 0;
  const s = value / PHEROMONE_MAX;
  return s > 0.6 ? 3 : s > 0.25 ? 2 : 1;
}

/** The stamp for intensity `lvl` (1-3), variant chosen by the tile hash `v` */
function pickStamp(stamps: CanvasImageSource[], lvl: number, v: number): CanvasImageSource {
  const variants = Math.max(1, Math.floor(stamps.length / 3));
  return stamps[(lvl - 1) * variants + (v % variants)];
}

/**
 * The pheromone trails, cached in 8×8-tile chunks. Drawing one stamp per tile
 * and scent every frame cost thousands of drawImage calls once trails covered
 * the map; a trail's drawn level only changes when its strength crosses a
 * threshold, so each chunk keeps its picture and is repainted only when one
 * of its tiles changed level (or was explored). A frame then blits a few
 * dozen chunk canvases. Chunks are added (lighter) onto the scene, like the
 * stamps were.
 */
export class PheromoneLayer {
  private readonly cols: number;
  private readonly rows: number;
  /** Drawn code per tile: home | food << 2 | danger << 4 | explored << 6 (255 = never drawn) */
  private readonly codes: Uint8Array;
  private readonly canvases: Array<OffscreenCanvas | null>;
  /** Whether a chunk's picture holds any stamp (empty chunks are not blitted) */
  private readonly filled: Uint8Array;
  private readonly dirty: Uint8Array;

  private readonly width: number;
  private readonly height: number;
  private readonly stamps: PheromoneStamps;

  constructor(width: number, height: number, stamps: PheromoneStamps) {
    this.width = width;
    this.height = height;
    this.stamps = stamps;
    this.cols = Math.ceil(width / CHUNK);
    this.rows = Math.ceil(height / CHUNK);
    this.codes = new Uint8Array(width * height).fill(255);
    this.canvases = new Array(this.cols * this.rows).fill(null);
    this.filled = new Uint8Array(this.cols * this.rows);
    this.dirty = new Uint8Array(this.cols * this.rows).fill(1);
  }

  /** Draw the trails over tiles [startX, endX) × [startY, endY), in world px (camera transform applied) */
  draw(ctx: CanvasRenderingContext2D, grid: ScentGrid, explored: ExploredGrid, startX: number, startY: number, endX: number, endY: number): void {
    const c0 = Math.max(0, Math.floor(startX / CHUNK));
    const r0 = Math.max(0, Math.floor(startY / CHUNK));
    const c1 = Math.min(this.cols - 1, Math.floor((endX - 1) / CHUNK));
    const r1 = Math.min(this.rows - 1, Math.floor((endY - 1) / CHUNK));
    let repaints = 0;

    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const chunk = r * this.cols + c;
        if (this.scan(grid, explored, c, r)) this.dirty[chunk] = 1;
        if (this.dirty[chunk] && repaints < MAX_REPAINTS_PER_FRAME) {
          this.repaint(c, r);
          repaints++;
        }
        const canvas = this.canvases[chunk];
        if (canvas && this.filled[chunk]) ctx.drawImage(canvas, c * CHUNK * TILE_SIZE, r * CHUNK * TILE_SIZE);
      }
    }
  }

  /** Recompute the chunk's tile codes; true when any changed since it was last painted */
  private scan(grid: ScentGrid, explored: ExploredGrid, c: number, r: number): boolean {
    let changed = false;
    const x1 = Math.min(this.width, (c + 1) * CHUNK);
    const y1 = Math.min(this.height, (r + 1) * CHUNK);
    for (let y = r * CHUNK; y < y1; y++) {
      for (let x = c * CHUNK; x < x1; x++) {
        const tile = grid.getTile(x, y);
        let code = 0;
        if (tile && explored.isExplored(x, y)) {
          code = 64 | level(tile.homePheromone) | (level(tile.foodPheromone) << 2) | (level(tile.dangerPheromone) << 4);
          // Explored but scentless draws nothing: one code for both
          if (code === 64) code = 0;
        }
        const i = y * this.width + x;
        if (this.codes[i] !== code) {
          this.codes[i] = code;
          changed = true;
        }
      }
    }
    return changed;
  }

  private repaint(c: number, r: number): void {
    const chunk = r * this.cols + c;
    this.dirty[chunk] = 0;
    const x1 = Math.min(this.width, (c + 1) * CHUNK);
    const y1 = Math.min(this.height, (r + 1) * CHUNK);
    let any = false;
    for (let y = r * CHUNK; y < y1 && !any; y++) {
      for (let x = c * CHUNK; x < x1; x++) {
        if (this.codes[y * this.width + x] !== 0) {
          any = true;
          break;
        }
      }
    }
    this.filled[chunk] = any ? 1 : 0;
    if (!any) return;

    let canvas = this.canvases[chunk];
    if (!canvas) {
      canvas = new OffscreenCanvas(CHUNK * TILE_SIZE, CHUNK * TILE_SIZE);
      this.canvases[chunk] = canvas;
    }
    const g = canvas.getContext('2d')!;
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.globalCompositeOperation = 'lighter';
    for (let y = r * CHUNK; y < y1; y++) {
      for (let x = c * CHUNK; x < x1; x++) {
        const code = this.codes[y * this.width + x];
        if (code === 0) continue;
        const px = (x - c * CHUNK) * TILE_SIZE;
        const py = (y - r * CHUNK) * TILE_SIZE;
        const home = code & 3;
        const food = (code >> 2) & 3;
        const danger = (code >> 4) & 3;
        const v = ((x * 73856093) ^ (y * 19349663)) >>> 0;
        if (home) g.drawImage(pickStamp(this.stamps.home, home, v), px, py);
        if (food) g.drawImage(pickStamp(this.stamps.food, food, v), px, py);
        if (danger) g.drawImage(pickStamp(this.stamps.danger, danger, v), px, py);
      }
    }
    g.globalCompositeOperation = 'source-over';
  }
}
