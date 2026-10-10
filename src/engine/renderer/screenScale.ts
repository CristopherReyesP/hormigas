import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../../shared/constants';

/**
 * Whole canvas px per pixel of a screen-space overlay (vignette, dusk alarm,
 * intro edge ping). Those overlays were drawn for the old 800×600 buffer that
 * the browser scaled up to cover the window; this is that cover scale, rounded
 * to a whole number, so on the real-size canvas they keep their on-screen size
 * and stay crisp.
 */
export function screenPixelScale(canvasWidth: number, canvasHeight: number): number {
  return Math.max(1, Math.round(Math.max(canvasWidth / CANVAS_WIDTH, canvasHeight / CANVAS_HEIGHT)));
}
