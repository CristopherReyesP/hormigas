import { MAX_ZOOM, MIN_ZOOM, ZOOM_STEP } from '../../engine/camera/Camera';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../../shared/constants';

/**
 * Real window-size rendering.
 *
 * The canvas backing store matches the window: CSS size × devicePixelRatio
 * (capped), so the browser never upscales a small buffer. Zoom is canvas px
 * per world px; with zoom on the 0.5 grid every art pixel (2 world px) lands
 * on whole canvas px, and every canvas px covers whole device px.
 */

/** Most canvas px per CSS px: 4K-class buffers on 3x phones cost fill time and add no crispness. */
export const MAX_PIXEL_RATIO = 2;

/** Length of an ant in world pixels at zoom 1. */
export const ANT_WORLD_PX = 36;
/** The default zoom never shows an ant shorter than this, in CSS px. */
export const MIN_ANT_SCREEN_PX = 28;
/**
 * World width (px) the old fixed 800×600 canvas showed at its usual default
 * zoom of 0.5: the framing players know. Wide windows show at least this.
 */
export const REFERENCE_VIEW_WORLD_PX = 1600;

export interface CanvasFit {
  /** Backing store size in canvas px */
  backingWidth: number;
  backingHeight: number;
  /** Canvas px per CSS px */
  pixelRatio: number;
  /** CSS px per canvas px (1 / pixelRatio) */
  scale: number;
  /** Displayed canvas size in CSS px: exactly the backing store / pixelRatio */
  width: number;
  height: number;
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

/**
 * Canvas px per CSS px for a device ratio. Up to the cap it is the device
 * ratio itself (1 canvas px = 1 device px). Above it the ratio is divided by
 * the smallest whole number that fits under the cap, so each canvas px still
 * covers a whole number of device px (3x → 1.5, 4x → 2) and stays crisp.
 */
export function canvasPixelRatio(dpr: number, cap = MAX_PIXEL_RATIO): number {
  const ratio = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  return ratio / Math.max(1, Math.ceil(ratio / cap - 1e-9));
}

/** Backing store and CSS size of a canvas that fills a cssW×cssH window. */
export function fitCanvasToWindow(cssW: number, cssH: number, dpr = 1): CanvasFit {
  if (!(cssW > 0) || !(cssH > 0)) {
    return {
      backingWidth: CANVAS_WIDTH, backingHeight: CANVAS_HEIGHT, pixelRatio: 1, scale: 1,
      width: CANVAS_WIDTH, height: CANVAS_HEIGHT,
    };
  }
  const pixelRatio = canvasPixelRatio(dpr);
  const backingWidth = Math.max(1, Math.round(cssW * pixelRatio));
  const backingHeight = Math.max(1, Math.round(cssH * pixelRatio));
  return {
    backingWidth,
    backingHeight,
    pixelRatio,
    scale: 1 / pixelRatio,
    width: backingWidth / pixelRatio,
    height: backingHeight / pixelRatio,
  };
}

/** The band of the canvas (canvas px) the player sees between the HUD bars (CSS px insets). */
export function visibleCanvasRect(fit: CanvasFit, insets: ScreenInsets): ViewRect {
  const top = Math.max(0, Math.min(fit.backingHeight - 1, insets.top * fit.pixelRatio));
  const bottom = Math.max(0, insets.bottom * fit.pixelRatio);
  return {
    x: 0,
    y: top,
    w: fit.backingWidth,
    h: Math.max(1, fit.backingHeight - top - bottom),
  };
}

/**
 * Default zoom (0.5 grid, canvas px per world px) for a canvas `canvasWidth`
 * canvas px wide: the closest zoom that still shows at least the old
 * 800×600 framing (REFERENCE_VIEW_WORLD_PX across), raised when that would
 * shrink an ant under MIN_ANT_SCREEN_PX on screen (small windows).
 */
export function pickDefaultZoom(canvasWidth: number, pixelRatio = 1, antWorldPx = ANT_WORLD_PX): number {
  const ratio = pixelRatio > 0 ? pixelRatio : 1;
  const wide = Math.floor(canvasWidth / REFERENCE_VIEW_WORLD_PX / ZOOM_STEP + 1e-9) * ZOOM_STEP;
  const legible = Math.ceil((MIN_ANT_SCREEN_PX * ratio) / antWorldPx / ZOOM_STEP - 1e-9) * ZOOM_STEP;
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM * ratio, Math.max(wide, legible)));
}
