import { MAX_ZOOM, MIN_ZOOM, ZOOM_STEP } from '../../engine/camera/Camera';

/**
 * Full-window world view for a fixed-resolution canvas.
 *
 * The renderer draws at a fixed logical size (CANVAS_WIDTH × CANVAS_HEIGHT),
 * so the canvas is scaled up to COVER the window and centered; whatever falls
 * outside the window is cropped, the way fixed-resolution pixel-art games fill
 * a screen. When a whole number of device pixels per canvas pixel costs only a
 * little extra crop, that scale wins so pixels stay perfectly even.
 */

/** Largest extra zoom (ratio) accepted to land on a whole device-pixel scale. */
const INTEGER_SNAP_TOLERANCE = 1.15;

/** Length of an ant in world pixels at zoom 1 (about 12 art px × 3). */
export const ANT_WORLD_PX = 36;
/** On-screen ant length the default zoom aims for, in CSS px. */
export const TARGET_ANT_SCREEN_PX = 32;

export interface CanvasFit {
  /** CSS px per canvas px */
  scale: number;
  /** Displayed canvas size in CSS px */
  width: number;
  height: number;
  /** Canvas offset inside the window in CSS px (negative when cropped) */
  left: number;
  top: number;
}

export interface ScreenInsets {
  top: number;
  bottom: number;
}

export interface ViewRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function fitCanvasToViewport(
  viewW: number,
  viewH: number,
  logicalW: number,
  logicalH: number,
  dpr = 1,
): CanvasFit {
  if (viewW <= 0 || viewH <= 0) {
    return { scale: 1, width: logicalW, height: logicalH, left: 0, top: 0 };
  }
  const ratio = dpr > 0 ? dpr : 1;
  const exactDevice = Math.max(viewW / logicalW, viewH / logicalH) * ratio;
  const wholeDevice = Math.ceil(exactDevice - 1e-9);
  const deviceScale = wholeDevice / exactDevice <= INTEGER_SNAP_TOLERANCE ? wholeDevice : exactDevice;
  const scale = deviceScale / ratio;
  const width = logicalW * scale;
  const height = logicalH * scale;
  // Offsets land on whole device pixels so the canvas grid lines up with the screen
  const left = Math.round(((viewW - width) / 2) * ratio) / ratio;
  const top = Math.round(((viewH - height) / 2) * ratio) / ratio;
  return { scale, width, height, left: left || 0, top: top || 0 };
}

/** The part of the canvas (in canvas px) the player sees between the HUD bars. */
export function visibleCanvasRect(
  fit: CanvasFit,
  viewW: number,
  viewH: number,
  insets: ScreenInsets,
  logicalW: number,
  logicalH: number,
): ViewRect {
  const clampX = (v: number) => Math.max(0, Math.min(logicalW, v));
  const clampY = (v: number) => Math.max(0, Math.min(logicalH, v));
  const x0 = clampX((0 - fit.left) / fit.scale);
  const x1 = clampX((viewW - fit.left) / fit.scale);
  const y0 = clampY((insets.top - fit.top) / fit.scale);
  const y1 = clampY((viewH - insets.bottom - fit.top) / fit.scale);
  return {
    x: x0,
    y: Math.min(y0, logicalH - 1),
    w: Math.max(1, x1 - x0),
    h: Math.max(1, y1 - y0),
  };
}

/** Zoom step (0.5 grid) that shows an ant closest to TARGET_ANT_SCREEN_PX at this display scale. */
export function pickDefaultZoom(
  scale: number,
  antWorldPx = ANT_WORLD_PX,
  targetPx = TARGET_ANT_SCREEN_PX,
): number {
  let best = MIN_ZOOM;
  let bestError = Infinity;
  for (let zoom = MIN_ZOOM; zoom <= MAX_ZOOM + 1e-9; zoom += ZOOM_STEP) {
    const error = Math.abs(antWorldPx * zoom * scale - targetPx);
    if (error < bestError - 1e-9) {
      best = zoom;
      bestError = error;
    }
  }
  return best;
}
