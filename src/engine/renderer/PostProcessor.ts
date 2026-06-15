import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../../shared/constants';
import { PAL } from './pixelart/palette';

/**
 * Post-processing effects applied in screen space after all world rendering.
 * Pixel-art style: corner dither vignette (pre-rendered once, no gradients)
 * plus a single quantized warm tint for the surface layer.
 */
export class PostProcessor {
  private vignetteCanvas: OffscreenCanvas | null = null;
  private warmTint: string;
  private nightLevel = 0; // 0 = day, 1 = dusk/dawn edge, 2 = deep night (quantized, no smooth ramp)

  constructor() {
    // Quantized warm tint derived from the palette (surface daylight feel)
    const h = PAL.glowAmber.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    this.warmTint = `rgba(${r}, ${g}, ${b}, 0.06)`;
  }

  /** Quantize the day phase into discrete tint steps (pixel-art rule: no gradients) */
  setDayPhase(phase: 'day' | 'night', progress: number): void {
    if (phase === 'day') {
      this.nightLevel = 0;
    } else {
      // First and last 15% of the night are the dusk/dawn edge step
      this.nightLevel = progress < 0.15 || progress > 0.85 ? 1 : 2;
    }
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
   * Apply post-processing effects to the provided context.
   * Should be called AFTER camera transform is undone (in screen space).
   * Only invoked for the surface layer (underground frames return earlier),
   * so the warm tint is surface-only by construction.
   */
  apply(ctx: CanvasRenderingContext2D): void {
    if (!this.vignetteCanvas) {
      this.vignetteCanvas = this.buildVignette();
    }
    ctx.drawImage(this.vignetteCanvas, 0, 0);

    if (this.nightLevel > 0) {
      // Night: cool dark blue wash, two discrete steps (edge vs deep night)
      ctx.fillStyle = this.nightLevel === 1 ? 'rgba(13, 22, 46, 0.22)' : 'rgba(9, 14, 38, 0.4)';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    } else {
      // Day: single quantized warm tint (surface daylight feel)
      ctx.fillStyle = this.warmTint;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }
  }
}
