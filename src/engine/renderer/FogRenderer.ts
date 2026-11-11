import { WORLD_WIDTH, WORLD_HEIGHT, TILE_SIZE } from '../../shared/constants';
import type { VisibilityGrid } from '../../simulation/world/VisibilityGrid';
import { FOG_CLEAR_BRIGHTNESS } from './fogVisibility';
import { PAL } from './pixelart/palette';

// Quantized fog levels — pixel art reads as stepped bands, not smooth fades.
// Every fog pixel is one of exactly three alphas: 0 / 0.45 / 0.9.
const FOG_ALPHA = [0, 115, 230] as const; // clear, explored, unexplored
const BRIGHTNESS_CLEAR_THRESHOLD = FOG_CLEAR_BRIGHTNESS; // >= half-bright snaps to fully clear

/** Fog cells per tile side: the edge between two levels is dithered at this grain (4 screen px) */
export const FOG_CELLS = 8;

/** 4×4 ordered-dither thresholds, 0..1 */
const BAYER = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
].map((v) => (v + 0.5) / 16);

/** Fog level of a tile: 0 clear, 1 explored, 2 unexplored */
export function fogLevel(explored: boolean, brightness: number): 0 | 1 | 2 {
  if (!explored) return 2;
  return brightness >= BRIGHTNESS_CLEAR_THRESHOLD ? 0 : 1;
}

/**
 * The fog level of one cell of a tile whose own level is `own`. `u, v` is the
 * cell's center inside the tile, each in (-0.5, 0.5); `side`, `updown` and
 * `corner` are the levels of the neighbours the cell leans toward. The levels
 * are blended by distance, then snapped back to a whole level by the ordered
 * dither threshold `t`: the border between two fog bands becomes a dithered
 * strip half a tile deep on each side instead of a staircase of tile corners.
 * No in-between alpha is ever produced.
 */
export function ditheredFogLevel(own: number, side: number, updown: number, corner: number, u: number, v: number, t: number): number {
  const wx = Math.abs(u);
  const wy = Math.abs(v);
  const blend = (own * (1 - wx) + side * wx) * (1 - wy) + (updown * (1 - wx) + corner * wx) * wy;
  const low = Math.floor(blend);
  return blend - low > t ? low + 1 : low;
}

export class FogRenderer {
  private fogCanvas: HTMLCanvasElement;
  private fogCtx: CanvasRenderingContext2D;
  private fogImageData: ImageData;
  /** Level drawn per tile (255 = never drawn) */
  private levels = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT).fill(255);
  private next = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT);

  private visibilityGrid: VisibilityGrid;

  constructor(visibilityGrid: VisibilityGrid) {
    this.visibilityGrid = visibilityGrid;
    this.fogCanvas = document.createElement('canvas');
    this.fogCanvas.width = WORLD_WIDTH * FOG_CELLS;
    this.fogCanvas.height = WORLD_HEIGHT * FOG_CELLS;
    this.fogCtx = this.fogCanvas.getContext('2d')!;
    this.fogImageData = this.fogCtx.createImageData(this.fogCanvas.width, this.fogCanvas.height);

    // Initialize fully unexplored, in the deep violet of the alien void
    const data = this.fogImageData.data;
    const rgb = parseInt(PAL.fogVoid.slice(1), 16);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = (rgb >> 16) & 255;
      data[i + 1] = (rgb >> 8) & 255;
      data[i + 2] = rgb & 255;
      data[i + 3] = FOG_ALPHA[2];
    }
    this.fogCtx.putImageData(this.fogImageData, 0, 0);
  }

  update(): void {
    const grid = this.visibilityGrid;
    const W = WORLD_WIDTH;
    const H = WORLD_HEIGHT;
    const next = this.next;
    const levels = this.levels;

    // Which tiles changed level since the last frame (most frames: a handful, or none)
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const level = fogLevel(grid.isExplored(x, y), grid.getBrightness(x, y));
        next[i] = level;
        if (level !== levels[i]) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) return;
    this.levels = next;
    this.next = levels;

    // A tile's cells lean on its neighbours: repaint one tile around the change too
    x0 = Math.max(0, x0 - 1);
    y0 = Math.max(0, y0 - 1);
    x1 = Math.min(W - 1, x1 + 1);
    y1 = Math.min(H - 1, y1 + 1);
    const data = this.fogImageData.data;
    const stride = W * FOG_CELLS;
    const at = (x: number, y: number) => next[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const own = next[y * W + x];
        const uniform = at(x - 1, y) === own && at(x + 1, y) === own && at(x, y - 1) === own && at(x, y + 1) === own
          && at(x - 1, y - 1) === own && at(x + 1, y - 1) === own && at(x - 1, y + 1) === own && at(x + 1, y + 1) === own;
        for (let cy = 0; cy < FOG_CELLS; cy++) {
          const gy = y * FOG_CELLS + cy;
          const v = (cy + 0.5) / FOG_CELLS - 0.5;
          const ny = v < 0 ? y - 1 : y + 1;
          for (let cx = 0; cx < FOG_CELLS; cx++) {
            const gx = x * FOG_CELLS + cx;
            let level = own;
            if (!uniform) {
              const u = (cx + 0.5) / FOG_CELLS - 0.5;
              const nx = u < 0 ? x - 1 : x + 1;
              level = ditheredFogLevel(own, at(nx, y), at(x, ny), at(nx, ny), u, v, BAYER[(gy & 3) * 4 + (gx & 3)]);
            }
            data[(gy * stride + gx) * 4 + 3] = FOG_ALPHA[level];
          }
        }
      }
    }
    const px = x0 * FOG_CELLS;
    const py = y0 * FOG_CELLS;
    this.fogCtx.putImageData(this.fogImageData, 0, 0, px, py, (x1 - x0 + 1) * FOG_CELLS, (y1 - y0 + 1) * FOG_CELLS);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    // Smoothing OFF: the fog's dithered edges must stay crisp pixels
    const prevSmoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      this.fogCanvas,
      0, 0, this.fogCanvas.width, this.fogCanvas.height,
      0, 0, WORLD_WIDTH * TILE_SIZE, WORLD_HEIGHT * TILE_SIZE
    );
    ctx.imageSmoothingEnabled = prevSmoothing;
  }
}
