import { PAL, hash2 } from './pixelart/palette';

/**
 * Cloud shadows drifting across the surface by day — the cheapest "there is
 * a sky up there" cue. Each shape is a dithered blob pre-rendered once at
 * one px per CELL world px and stretched with smoothing off, so a frame costs
 * one drawImage per on-screen cloud. Same stepped language as the vignette:
 * a solid core, a checker rim, a sparse fringe — never a gradient.
 */

/** World px per cloud-canvas px. */
const CELL = 8;
/** Distinct pre-rendered shapes, reused by every cloud. */
const SHAPES = 3;
/** Clouds in flight over the whole world. */
const CLOUDS = 9;
/** Shadow strength: subtle enough to never hide a unit. */
const SHADOW_ALPHA = 0.2;
/** Drift in world px per second (the same way the wind blows the particles). */
const DRIFT_X = 9;
const DRIFT_Y = 2.5;

interface Cloud {
  shape: number;
  /** Start position, world px */
  x0: number;
  y0: number;
  /** Speed multiplier, so the clouds slowly change formation */
  speed: number;
}

/** Wrap `v` into [lo, lo + span). */
function wrap(v: number, lo: number, span: number): number {
  return lo + ((((v - lo) % span) + span) % span);
}

export class CloudShadows {
  private shapes: OffscreenCanvas[] | null = null;
  private clouds: Cloud[];
  private worldW: number;
  private worldH: number;

  constructor(worldW: number, worldH: number) {
    this.worldW = worldW;
    this.worldH = worldH;
    this.clouds = Array.from({ length: CLOUDS }, (_, i) => ({
      shape: i % SHAPES,
      x0: hash2(i, 11) * worldW,
      y0: hash2(i, 23) * worldH,
      speed: 0.8 + hash2(i, 37) * 0.5,
    }));
  }

  /** One blob: a few overlapping ellipses, edges stepped by a hash dither. */
  private buildShape(seed: number): OffscreenCanvas {
    const cols = 48 + Math.floor(hash2(seed, 1) * 24);
    const rows = Math.floor(cols * 0.55);
    const canvas = new OffscreenCanvas(cols, rows);
    const ctx = canvas.getContext('2d')!;
    const lobes = Array.from({ length: 4 }, (_, i) => ({
      cx: cols * (0.22 + 0.56 * hash2(seed, 10 + i)),
      cy: rows * (0.35 + 0.3 * hash2(seed, 20 + i)),
      rx: cols * (0.18 + 0.12 * hash2(seed, 30 + i)),
      ry: rows * (0.25 + 0.15 * hash2(seed, 40 + i)),
    }));
    ctx.fillStyle = PAL.outline;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        let d = Infinity;
        for (const l of lobes) {
          const dx = (x + 0.5 - l.cx) / l.rx;
          const dy = (y + 0.5 - l.cy) / l.ry;
          d = Math.min(d, Math.sqrt(dx * dx + dy * dy));
        }
        if (d >= 1) continue;
        const on =
          d < 0.7 ? true :                                        // core
          d < 0.88 ? (x + y) % 2 === 0 :                          // checker rim
          x % 2 === 0 && y % 2 === 0 && hash2(x + seed, y) < 0.8; // ragged fringe
        if (on) ctx.fillRect(x, y, 1, 1);
      }
    }
    return canvas;
  }

  /**
   * Draw in world space (camera transform applied). `time` is game time, so a
   * paused game holds the clouds; `view` is the visible world rect.
   */
  draw(ctx: CanvasRenderingContext2D, time: number, view: { x: number; y: number; w: number; h: number }): void {
    if (!this.shapes) this.shapes = Array.from({ length: SHAPES }, (_, i) => this.buildShape(i * 97 + 5));

    const prevAlpha = ctx.globalAlpha;
    const smoothing = ctx.imageSmoothingEnabled;
    ctx.globalAlpha = SHADOW_ALPHA;
    ctx.imageSmoothingEnabled = false;
    for (const c of this.clouds) {
      const shape = this.shapes[c.shape];
      const w = shape.width * CELL;
      const h = shape.height * CELL;
      // Wrap over the world plus one cloud of margin, so they slide in and out
      const x = wrap(c.x0 + time * DRIFT_X * c.speed, -w, this.worldW + w);
      const y = wrap(c.y0 + time * DRIFT_Y * c.speed, -h, this.worldH + h);
      if (x + w < view.x || x > view.x + view.w || y + h < view.y || y > view.y + view.h) continue;
      // Snap to the 2px art raster, like the particles
      ctx.drawImage(shape, Math.round(x / 2) * 2, Math.round(y / 2) * 2, w, h);
    }
    ctx.globalAlpha = prevAlpha;
    ctx.imageSmoothingEnabled = smoothing;
  }
}
