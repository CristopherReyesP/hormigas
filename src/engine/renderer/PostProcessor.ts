import { PAL, withAlpha } from './pixelart/palette';
import { screenPixelScale } from './screenScale';

/**
 * Screen-space pass applied after all world rendering (surface layer only —
 * underground frames return before this and run their own BFS light map;
 * they borrow just the dusk alarm via applyAlarm()).
 *
 * Three jobs:
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
 *
 * 3. DUSK ALARM. When day turns into night, a red dithered frame beats twice
 *    around the screen. It runs on game time (advance(dt)), so a paused game
 *    holds the pulse instead of playing it out behind the pause.
 *
 * Everything follows the real canvas size (read from the context each frame).
 * The dither overlays are cached at one px per cell and drawn with smoothing
 * off, so building them is cheap and they stay crisp at any size; after a
 * resize they rebuild once the new size has held for RESIZE_SETTLE_FRAMES.
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
  { until: 0.62, step: { color: PAL.skyNoon, alpha: 0.07 } }, // faint alien violet
  { until: 0.84, step: { color: PAL.skyAfternoon, alpha: 0.1 } },
  { until: 1.01, step: { color: PAL.skyDusk, alpha: 0.2 } },
];

// Red-violet night: the Swarm's hour, not a navy sky
const NIGHT_EDGE: SkyStep = { color: PAL.skyNightEdge, alpha: 0.28 };
const NIGHT_DEEP: SkyStep = { color: PAL.skyNightDeep, alpha: 0.5 };

/** First and last 15% of the night are the dusk/dawn edge step. */
function nightStep(progress: number): SkyStep {
  return progress < 0.15 || progress > 0.85 ? NIGHT_EDGE : NIGHT_DEEP;
}

/** Strongest alpha of the post-tint bioluminescence (Swarm veins, crater cracks). */
export const NIGHT_GLOW_MAX = 0.85;

/**
 * Alpha for glows drawn AFTER the night tint: zero by day, scaled by how dark
 * the current night step is, so the veins shine through exactly as much
 * darkness as there is to shine through.
 */
export function nightGlowAlpha(phase: 'day' | 'night', progress: number): number {
  if (phase !== 'night') return 0;
  return NIGHT_GLOW_MAX * (nightStep(progress).alpha / NIGHT_DEEP.alpha);
}

/** Size of the pre-rendered light mask. Scaled per light at draw time. */
const MASK_SIZE = 256;

/** Frames a new canvas size must hold before the dither caches rebuild: a window drag resizes every frame. */
export const RESIZE_SETTLE_FRAMES = 12;

/**
 * Canvas px per night-layer px. The night sheet is a flat wash with chunky
 * dithered light pools, so half resolution looks the same (upscaled crisp)
 * and cuts its per-frame fill to a quarter.
 */
const NIGHT_LAYER_SCALE = 2;

/** A dither overlay pre-rendered at one px per cell, drawn `cell`× bigger with smoothing off. */
interface CellLayer {
  canvas: OffscreenCanvas;
  cell: number;
}

/** Seconds the dusk alarm runs: two beats of equal length. */
export const DUSK_ALARM_DURATION = 1.6;
/** Stepped alarm levels; beat one walks the whole ladder, beat two starts one rung down. */
const ALARM_STEPS = [0.6, 0.4, 0.2, 0] as const;

/**
 * Dusk alarm strength `t` seconds after nightfall: a stepped double pulse
 * (0.6 → 0.4 → 0.2 → 0, then 0.4 → 0.2 → 0), never a smooth fade.
 */
export function duskAlarmAlpha(t: number): number {
  if (t < 0 || t >= DUSK_ALARM_DURATION) return 0;
  const beatLen = DUSK_ALARM_DURATION / 2;
  const beat = Math.floor(t / beatLen);
  const quarter = Math.floor(((t % beatLen) / beatLen) * 4);
  return ALARM_STEPS[Math.min(ALARM_STEPS.length - 1, beat + quarter)];
}

export class PostProcessor {
  private vignette: CellLayer | null = null;
  private alarm: CellLayer | null = null;
  private nightCanvas: OffscreenCanvas | null = null;
  private lightMask: OffscreenCanvas | null = null;

  private sky: SkyStep = DAY_STEPS[2].step;
  private isNight = false;
  private lights: ScreenLight[] = [];
  /** Phase seen on the previous call — null until the first frame */
  private lastPhase: 'day' | 'night' | null = null;
  /** Seconds since the dusk alarm fired; negative = idle */
  private alarmTime = -1;

  /** Canvas size seen on the latest frame, and how many frames in a row it has held */
  private seenW = 0;
  private seenH = 0;
  private steadyFrames = 0;
  /** Size the dither caches are built for: the first size at once, later ones once they settle */
  private cacheW = 0;
  private cacheH = 0;

  /** Pick the single sky step for this frame (never a blend of two) */
  setDayPhase(phase: 'day' | 'night', progress: number): void {
    // Only a witnessed day → night flip fires the alarm (not a load into night)
    if (this.lastPhase === 'day' && phase === 'night') this.alarmTime = 0;
    this.lastPhase = phase;

    if (phase === 'day') {
      this.isNight = false;
      const p = Math.max(0, Math.min(1, progress));
      this.sky = (DAY_STEPS.find((s) => p < s.until) ?? DAY_STEPS[DAY_STEPS.length - 1]).step;
    } else {
      this.isNight = true;
      this.sky = nightStep(progress);
    }
  }

  /** Current sky state — read by tests and any UI that wants to mirror it */
  getSkyState(): { color: string; alpha: number; night: boolean } {
    return { color: this.sky.color, alpha: this.sky.alpha, night: this.isNight };
  }

  /** Advance time-based effects by game time (dt = 0 while paused holds them). */
  advance(dt: number): void {
    if (this.alarmTime < 0) return;
    this.alarmTime += dt;
    if (this.alarmTime >= DUSK_ALARM_DURATION) this.alarmTime = -1;
  }

  /** Current dusk alarm alpha (0 when idle) — read by tests and the draw pass */
  getAlarmLevel(): number {
    return this.alarmTime < 0 ? 0 : duskAlarmAlpha(this.alarmTime);
  }

  /**
   * Light sources for this frame, in screen pixels. Only consulted at night —
   * during the day the sky wash is far too subtle to be worth punching.
   */
  setLights(lights: ScreenLight[]): void {
    this.lights = lights;
  }

  /**
   * Follow the canvas size, once per frame. The first size is adopted at
   * once; a new one only after it has held for RESIZE_SETTLE_FRAMES, so a
   * window drag does not rebuild the dither caches every frame.
   */
  private trackCanvas(ctx: CanvasRenderingContext2D): { w: number; h: number } {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    if (w !== this.seenW || h !== this.seenH) {
      this.seenW = w;
      this.seenH = h;
      this.steadyFrames = 0;
    } else {
      this.steadyFrames++;
    }
    const changed = w !== this.cacheW || h !== this.cacheH;
    if (changed && (this.cacheW === 0 || this.steadyFrames >= RESIZE_SETTLE_FRAMES)) {
      this.cacheW = w;
      this.cacheH = h;
      this.vignette = null; // both rebuilt lazily at the settled size
      this.alarm = null;
    }
    return { w, h };
  }

  /** Blit a dither layer: whole cells once settled; mid-resize the old layer is stretched over the canvas. */
  private drawCellLayer(ctx: CanvasRenderingContext2D, layer: CellLayer, w: number, h: number): void {
    const settled = w === this.cacheW && h === this.cacheH;
    const smoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      layer.canvas,
      0,
      0,
      settled ? layer.canvas.width * layer.cell : w,
      settled ? layer.canvas.height * layer.cell : h,
    );
    ctx.imageSmoothingEnabled = smoothing;
  }

  /** The dither vignette: black cells (2 overlay px), density stepped toward the corners. */
  private buildVignette(w: number, h: number): CellLayer {
    const cell = 2 * screenPixelScale(w, h);
    const cols = Math.ceil(w / cell);
    const rowsN = Math.ceil(h / cell);
    const canvas = new OffscreenCanvas(cols, rowsN);
    const ctx = canvas.getContext('2d')!;
    const cx = w / 2;
    const cy = h / 2;
    const maxD = Math.sqrt(cx * cx + cy * cy);

    // Two quantized bands: outer band sparse dither @0.15, corner band checker @0.3
    for (let band = 0; band < 2; band++) {
      ctx.fillStyle = withAlpha(PAL.black, band === 0 ? 0.15 : 0.3);
      for (let iy = 0; iy < rowsN; iy++) {
        for (let ix = 0; ix < cols; ix++) {
          const px = ix * cell + cell / 2;
          const py = iy * cell + cell / 2;
          const d = Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy)) / maxD;
          const inBand = band === 0 ? d >= 0.66 && d < 0.85 : d >= 0.85;
          if (!inBand) continue;
          const on = band === 0
            ? ix % 2 === 0 && iy % 2 === 0 // sparse: 1 of 4 cells
            : (ix + iy) % 2 === 0;          // denser: checkerboard
          if (on) ctx.fillRect(ix, iy, 1, 1);
        }
      }
    }
    return { canvas, cell };
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

    ctx.fillStyle = PAL.white; // destination-out reads alpha only
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
   * Red alarm frame: 4-overlay-px cells, solid at the screen edge, then
   * checker, then sparse — the same stepped density language as the vignette.
   */
  private buildAlarmVignette(w: number, h: number): CellLayer {
    const s = screenPixelScale(w, h);
    const cell = 4 * s;
    const cols = Math.ceil(w / cell);
    const rowsN = Math.ceil(h / cell);
    const canvas = new OffscreenCanvas(cols, rowsN);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = PAL.nightAlarm;
    for (let iy = 0; iy < rowsN; iy++) {
      for (let ix = 0; ix < cols; ix++) {
        const px = ix * cell + cell / 2;
        const py = iy * cell + cell / 2;
        const edge = Math.min(px, py, w - px, h - py) / s;
        const on =
          edge < 16 ? true :                              // solid rim
          edge < 36 ? (ix + iy) % 2 === 0 :               // checker
          edge < 60 ? ix % 2 === 0 && iy % 2 === 0 :      // sparse
          false;
        if (on) ctx.fillRect(ix, iy, 1, 1);
      }
    }
    return { canvas, cell };
  }

  /** Draw the dusk alarm pulse (screen space). The underground frame calls this alone. */
  applyAlarm(ctx: CanvasRenderingContext2D): void {
    const { w, h } = this.trackCanvas(ctx);
    this.drawAlarm(ctx, w, h);
  }

  private drawAlarm(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const level = this.getAlarmLevel();
    if (level <= 0) return;
    if (!this.alarm) this.alarm = this.buildAlarmVignette(this.cacheW, this.cacheH);
    const prev = ctx.globalAlpha;
    ctx.globalAlpha = level;
    this.drawCellLayer(ctx, this.alarm, w, h);
    ctx.globalAlpha = prev;
  }

  /**
   * Apply post-processing effects to the provided context.
   * Should be called AFTER camera transform is undone (in screen space).
   */
  apply(ctx: CanvasRenderingContext2D): void {
    const { w, h } = this.trackCanvas(ctx);
    if (!this.vignette) this.vignette = this.buildVignette(this.cacheW, this.cacheH);
    this.drawCellLayer(ctx, this.vignette, w, h);
    this.applySky(ctx, w, h);
    this.drawAlarm(ctx, w, h);
  }

  /** Time-of-day wash, with light pools punched through it at night. */
  private applySky(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const wash = withAlpha(this.sky.color, this.sky.alpha);

    // Daylight (and a lightless night) is a flat wash — one fillRect, as before.
    if (!this.isNight || this.lights.length === 0) {
      ctx.fillStyle = wash;
      ctx.fillRect(0, 0, w, h);
      return;
    }

    // Night with light sources: build the sheet of darkness, then erase the
    // pools before compositing, so the nest genuinely stays readable.
    const s = NIGHT_LAYER_SCALE;
    const nw = Math.ceil(w / s);
    const nh = Math.ceil(h / s);
    if (!this.lightMask) this.lightMask = this.buildLightMask();
    if (!this.nightCanvas) {
      this.nightCanvas = new OffscreenCanvas(nw, nh);
    } else if (this.nightCanvas.width !== nw || this.nightCanvas.height !== nh) {
      this.nightCanvas.width = nw; // follows the canvas in place: cheap, and only at night
      this.nightCanvas.height = nh;
    }

    const nctx = this.nightCanvas.getContext('2d')!;
    nctx.globalCompositeOperation = 'source-over';
    nctx.clearRect(0, 0, nw, nh);
    nctx.fillStyle = wash;
    nctx.fillRect(0, 0, nw, nh);

    nctx.globalCompositeOperation = 'destination-out';
    nctx.imageSmoothingEnabled = false;
    for (const l of this.lights) {
      if (l.radius <= 0) continue;
      // Cull lights whose pool cannot touch the canvas
      if (l.x + l.radius < 0 || l.x - l.radius > w) continue;
      if (l.y + l.radius < 0 || l.y - l.radius > h) continue;
      nctx.drawImage(this.lightMask, (l.x - l.radius) / s, (l.y - l.radius) / s, (l.radius * 2) / s, (l.radius * 2) / s);
    }
    nctx.globalCompositeOperation = 'source-over';

    const smoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.nightCanvas, 0, 0, nw * s, nh * s);
    ctx.imageSmoothingEnabled = smoothing;
  }
}
