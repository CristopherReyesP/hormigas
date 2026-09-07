import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../../shared/constants';
import { PAL } from './pixelart/palette';

/**
 * Screen-space pass applied after all world rendering (surface layer only —
 * underground frames return before this and run their own BFS light map).
 *
 * Two jobs:
 *
 * 1. TIME OF DAY. The sky steps through discrete states — dawn, morning, noon,
 *    afternoon, dusk, then two night steps. Exactly one is applied per frame and
 *    they are never blended, which is the same rule the sprites follow: shading
 *    is stepped, never a gradient. Previously the whole 150s day was a single
 *    flat wash and getPhaseProgress() was thrown away except at night.
 *
 * 2. LIGHT POOLS. At night the darkness is punched through at light sources
 *    (destination-out with a dithered disc) instead of covering the world in a
 *    uniform sheet. The nest reads as a beacon, the far field goes properly
 *    dark, and "come home before nightfall" becomes something you can SEE.
 */

/** One light source, in SCREEN pixels (the caller converts via Camera.worldToScreen) */
export interface ScreenLight {
  x: number;
  y: number;
  radius: number;
}

interface SkyStep {
  color: string;
  alpha: number;
}

/** Discrete sky states. `until` is the upper bound of phase progress (0..1). */
const DAY_STEPS: Array<{ until: number; step: SkyStep }> = [
  { until: 0.12, step: { color: PAL.skyDawn, alpha: 0.16 } },
  { until: 0.32, step: { color: PAL.skyMorning, alpha: 0.09 } },
  { until: 0.62, step: { color: PAL.skyNoon, alpha: 0.04 } },
  { until: 0.84, step: { color: PAL.skyAfternoon, alpha: 0.1 } },
  { until: 1.01, step: { color: PAL.skyDusk, alpha: 0.2 } },
];

const NIGHT_EDGE: SkyStep = { color: PAL.skyNightEdge, alpha: 0.24 };
const NIGHT_DEEP: SkyStep = { color: PAL.skyNightDeep, alpha: 0.46 };

/** Size of the pre-rendered light mask. Scaled per light at draw time. */
const MASK_SIZE = 256;

function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export class PostProcessor {
  private vignetteCanvas: OffscreenCanvas | null = null;
  private nightCanvas: OffscreenCanvas | null = null;
  private lightMask: OffscreenCanvas | null = null;

  private sky: SkyStep = DAY_STEPS[2].step;
  private isNight = false;
  private lights: ScreenLight[] = [];

  /** Pick the single sky step for this frame (never a blend of two) */
  setDayPhase(phase: 'day' | 'night', progress: number): void {
    if (phase === 'day') {
      this.isNight = false;
      const p = Math.max(0, Math.min(1, progress));
      this.sky = (DAY_STEPS.find((s) => p < s.until) ?? DAY_STEPS[DAY_STEPS.length - 1]).step;
    } else {
      this.isNight = true;
      // First and last 15% of the night are the dusk/dawn edge step
      this.sky = progress < 0.15 || progress > 0.85 ? NIGHT_EDGE : NIGHT_DEEP;
    }
  }

  /** Current sky state — read by tests and any UI that wants to mirror it */
  getSkyState(): { color: string; alpha: number; night: boolean } {
    return { color: this.sky.color, alpha: this.sky.alpha, night: this.isNight };
  }

  /**
   * Light sources for this frame, in screen pixels. Only consulted at night —
   * during the day the sky wash is far too subtle to be worth punching.
   */
  setLights(lights: ScreenLight[]): void {
    this.lights = lights;
  }

  /** Build the dither vignette once: 2px black cells, density stepped toward corners. */
  private buildVignette(): OffscreenCanvas {
    const canvas = new OffscreenCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    const ctx = canvas.getContext('2d')!;
    const CELL = 2;
    const cx = CANVAS_WIDTH / 2;
    const cy = CANVAS_HEIGHT / 2;
    const maxD = Math.sqrt(cx * cx + cy * cy);

    const cols = Math.ceil(CANVAS_WIDTH / CELL);
    const rowsN = Math.ceil(CANVAS_HEIGHT / CELL);

    // Two quantized bands: outer band sparse dither @0.15, corner band checker @0.3
    for (let band = 0; band < 2; band++) {
      ctx.fillStyle = band === 0 ? 'rgba(0, 0, 0, 0.15)' : 'rgba(0, 0, 0, 0.3)';
      for (let iy = 0; iy < rowsN; iy++) {
        for (let ix = 0; ix < cols; ix++) {
          const px = ix * CELL + CELL / 2;
          const py = iy * CELL + CELL / 2;
          const d = Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy)) / maxD;
          const inBand = band === 0 ? d >= 0.66 && d < 0.85 : d >= 0.85;
          if (!inBand) continue;
          const on = band === 0
            ? ix % 2 === 0 && iy % 2 === 0 // sparse: 1 of 4 cells
            : (ix + iy) % 2 === 0;          // denser: checkerboard
          if (on) ctx.fillRect(ix * CELL, iy * CELL, CELL, CELL);
        }
      }
    }
    return canvas;
  }

  /**
   * Pre-render the light falloff once: three quantized rings (solid core, dense
   * dither, sparse dither) rather than a smooth radial gradient. Drawn with
   * destination-out, so "white" means "erase this much darkness".
   */
  private buildLightMask(): OffscreenCanvas {
    const canvas = new OffscreenCanvas(MASK_SIZE, MASK_SIZE);
    const ctx = canvas.getContext('2d')!;
    const CELL = 4; // chunky on purpose — survives being scaled per light
    const c = MASK_SIZE / 2;

    ctx.fillStyle = '#ffffff';
    for (let iy = 0; iy < MASK_SIZE / CELL; iy++) {
      for (let ix = 0; ix < MASK_SIZE / CELL; ix++) {
        const px = ix * CELL + CELL / 2;
        const py = iy * CELL + CELL / 2;
        const d = Math.hypot(px - c, py - c) / c;
        if (d >= 1) continue;

        let on: boolean;
        if (d < 0.45) on = true;                          // lit core
        else if (d < 0.72) on = (ix + iy) % 2 === 0;      // checker falloff
        else on = ix % 2 === 0 && iy % 2 === 0;           // sparse rim
        if (on) ctx.fillRect(ix * CELL, iy * CELL, CELL, CELL);
      }
    }
    return canvas;
  }

  /**
   * Apply post-processing effects to the provided context.
   * Should be called AFTER camera transform is undone (in screen space).
   */
  apply(ctx: CanvasRenderingContext2D): void {
    if (!this.vignetteCanvas) this.vignetteCanvas = this.buildVignette();
    ctx.drawImage(this.vignetteCanvas, 0, 0);

    const wash = withAlpha(this.sky.color, this.sky.alpha);

    // Daylight (and a lightless night) is a flat wash — one fillRect, as before.
    if (!this.isNight || this.lights.length === 0) {
      ctx.fillStyle = wash;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      return;
    }

    // Night with light sources: build the sheet of darkness, then erase the
    // pools before compositing, so the nest genuinely stays readable.
    if (!this.lightMask) this.lightMask = this.buildLightMask();
    if (!this.nightCanvas) this.nightCanvas = new OffscreenCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);

    const nctx = this.nightCanvas.getContext('2d')!;
    nctx.globalCompositeOperation = 'source-over';
    nctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    nctx.fillStyle = wash;
    nctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    nctx.globalCompositeOperation = 'destination-out';
    nctx.imageSmoothingEnabled = false;
    for (const l of this.lights) {
      if (l.radius <= 0) continue;
      // Cull lights whose pool cannot touch the viewport
      if (l.x + l.radius < 0 || l.x - l.radius > CANVAS_WIDTH) continue;
      if (l.y + l.radius < 0 || l.y - l.radius > CANVAS_HEIGHT) continue;
      nctx.drawImage(this.lightMask, l.x - l.radius, l.y - l.radius, l.radius * 2, l.radius * 2);
    }
    nctx.globalCompositeOperation = 'source-over';

    ctx.drawImage(this.nightCanvas, 0, 0);
  }
}
