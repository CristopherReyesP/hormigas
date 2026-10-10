import { CANVAS_WIDTH, CANVAS_HEIGHT, WORLD_WIDTH, WORLD_HEIGHT, TILE_SIZE } from '../../shared/constants';

// 1: one art pixel stays a square of whole screen px on both axes (no vertical squash).
const PERSPECTIVE_Y_SCALE = 1;

// Pixel art shimmers at fractional zoom — zoom moves on a fixed 0.5 grid.
export const ZOOM_STEP = 0.5;
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 4;

/** Wheel delta (px) that counts as one notch: a mouse notch is ~100, a trackpad sends many small deltas. */
const WHEEL_NOTCH = 50;

/** World edge slack (world px) the view may show past the map border. */
const EDGE_PADDING = 50;

/** Zoom range of one camera: both ends sit on the 0.5 grid. */
export interface ZoomLimits {
  min: number;
  max: number;
}

const DEFAULT_LIMITS: ZoomLimits = { min: MIN_ZOOM, max: MAX_ZOOM };

function clampZoom(zoom: number, limits: ZoomLimits): number {
  return Math.max(limits.min, Math.min(limits.max, zoom));
}

/** Nearest 0.5 step inside the zoom limits. */
export function snapZoom(zoom: number, limits: ZoomLimits = DEFAULT_LIMITS): number {
  return clampZoom(Math.round(zoom / ZOOM_STEP) * ZOOM_STEP, limits);
}

/** Next 0.5 step from `current` in `direction` (+1 zooms in, -1 zooms out); off-grid values land on the grid. */
export function stepZoom(current: number, direction: 1 | -1, limits: ZoomLimits = DEFAULT_LIMITS): number {
  const steps = current / ZOOM_STEP;
  const next = direction > 0 ? Math.floor(steps + 1e-9) + 1 : Math.ceil(steps - 1e-9) - 1;
  return clampZoom(next * ZOOM_STEP, limits);
}

/**
 * Zoom range for a canvas of `canvasW`×`canvasH` canvas px holding
 * `pixelRatio` canvas px per CSS px. Zoom is canvas px per world px, so the
 * close-up limit scales with the ratio (MAX_ZOOM is the same close-up on
 * screen at any DPR), and the far limit stops once the whole canvas would
 * look past the map. Both ends land on the 0.5 grid.
 */
export function zoomLimits(
  canvasW: number,
  canvasH: number,
  pixelRatio: number,
  worldPxW: number,
  worldPxH: number,
): ZoomLimits {
  const ratio = pixelRatio > 0 ? pixelRatio : 1;
  const max = Math.max(MIN_ZOOM, Math.floor((MAX_ZOOM * ratio) / ZOOM_STEP + 1e-9) * ZOOM_STEP);
  const fitsMap = Math.max(canvasW / worldPxW, canvasH / worldPxH);
  const min = Math.max(MIN_ZOOM, Math.ceil(fitsMap / ZOOM_STEP - 1e-9) * ZOOM_STEP);
  return { min: Math.min(min, max), max };
}

/** Screen-space rect (canvas px) the player actually sees; HUD bars cover the rest. */
export interface ViewportRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A scripted framing: the world point (px) to center on and the zoom (snapped to the grid). */
export interface CameraShot {
  x: number;
  y: number;
  zoom: number;
}

export class Camera {
  x = 0;  // world pixel offset (top-left corner of the canvas)
  y = 0;
  zoom = 1;

  private worldWidth: number;
  private worldHeight: number;
  /** Whole canvas in canvas px (the backing store); the defaults hold until the UI measures the window */
  private canvasW = CANVAS_WIDTH;
  private canvasH = CANVAS_HEIGHT;
  /** Canvas px per CSS px of the current canvas */
  private pixelRatio = 1;
  private limits: ZoomLimits = DEFAULT_LIMITS;
  private viewport: ViewportRect = { x: 0, y: 0, w: CANVAS_WIDTH, h: CANVAS_HEIGHT };
  private defaultZoom = 1;
  private wheelAccum = 0;
  /** True while a cinematic owns the view; player pan, wheel zoom and reset are ignored. */
  private directed = false;

  constructor(worldWidth: number = WORLD_WIDTH, worldHeight: number = WORLD_HEIGHT) {
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;
  }

  applyTransform(ctx: CanvasRenderingContext2D): void {
    ctx.scale(this.zoom, this.zoom * PERSPECTIVE_Y_SCALE);
    ctx.translate(-this.x, -this.y);
  }

  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    return {
      x: screenX / this.zoom + this.x,
      y: screenY / (this.zoom * PERSPECTIVE_Y_SCALE) + this.y,
    };
  }

  screenToTile(screenX: number, screenY: number): { x: number; y: number } {
    const world = this.screenToWorld(screenX, screenY);
    return {
      x: Math.floor(world.x / TILE_SIZE),
      y: Math.floor(world.y / TILE_SIZE),
    };
  }

  pan(screenDx: number, screenDy: number): void {
    if (this.directed) return;
    this.x -= screenDx / this.zoom;
    this.y -= screenDy / (this.zoom * PERSPECTIVE_Y_SCALE);
    this.clamp();
  }

  /**
   * Wheel zoom around the cursor. Deltas accumulate until a full notch so a
   * trackpad's stream of tiny deltas cannot race through the steps.
   * delta > 0 → zoom out, delta < 0 → zoom in.
   */
  zoomAt(screenX: number, screenY: number, delta: number): void {
    if (delta === 0 || this.directed) return;
    if (Math.sign(delta) !== Math.sign(this.wheelAccum)) this.wheelAccum = 0;
    this.wheelAccum += delta;
    if (Math.abs(this.wheelAccum) < WHEEL_NOTCH) return;
    this.wheelAccum = 0;

    const worldBefore = this.screenToWorld(screenX, screenY);
    this.zoom = stepZoom(this.zoom, delta > 0 ? -1 : 1, this.limits);

    // Keep world point under mouse cursor stationary
    this.x = worldBefore.x - screenX / this.zoom;
    this.y = worldBefore.y - screenY / (this.zoom * PERSPECTIVE_Y_SCALE);
    this.clamp();
  }

  getZoom(): number {
    return this.zoom;
  }

  /** Zoom that suits the current display scale; used at start and by reset(). */
  setDefaultZoom(zoom: number): void {
    this.defaultZoom = snapZoom(zoom, this.limits);
  }

  getDefaultZoom(): number {
    return this.defaultZoom;
  }

  /** Set the zoom directly (snapped to the 0.5 grid), keeping the viewport center fixed. */
  setZoom(zoom: number): void {
    const center = this.viewportCenterWorld();
    this.zoom = snapZoom(zoom, this.limits);
    this.centerOn(center.x, center.y);
  }

  /**
   * The canvas backing store changed size (window resize or a new
   * devicePixelRatio). The zoom range follows it; a new pixel ratio rescales
   * the zoom so the world keeps its size on screen; the view stays centered.
   */
  setCanvasSize(width: number, height: number, pixelRatio = 1): void {
    const center = this.viewportCenterWorld();
    const ratio = pixelRatio > 0 ? pixelRatio : 1;
    const zoom = this.zoom * (ratio / this.pixelRatio);
    this.canvasW = Math.max(1, width);
    this.canvasH = Math.max(1, height);
    this.pixelRatio = ratio;
    this.limits = zoomLimits(this.canvasW, this.canvasH, ratio, this.worldWidth * TILE_SIZE, this.worldHeight * TILE_SIZE);
    this.zoom = snapZoom(zoom, this.limits);
    this.defaultZoom = snapZoom(this.defaultZoom, this.limits);
    this.centerOn(center.x, center.y);
  }

  getCanvasSize(): { width: number; height: number } {
    return { width: this.canvasW, height: this.canvasH };
  }

  getZoomLimits(): ZoomLimits {
    return { ...this.limits };
  }

  /** World px rect the WHOLE canvas shows (the HUD bars included): the culling bounds. */
  getCanvasWorldRect(): { x: number; y: number; w: number; h: number } {
    return {
      x: this.x,
      y: this.y,
      w: this.canvasW / this.zoom,
      h: this.canvasH / (this.zoom * PERSPECTIVE_Y_SCALE),
    };
  }

  /**
   * Declare which part of the canvas the player can see (the HUD covers the
   * rest). The world point in the middle of the old viewport stays centered.
   */
  setViewport(rect: ViewportRect): void {
    const center = this.viewportCenterWorld();
    this.viewport = {
      x: rect.x,
      y: rect.y,
      w: Math.max(1, rect.w),
      h: Math.max(1, rect.h),
    };
    this.centerOn(center.x, center.y);
  }

  getViewport(): ViewportRect {
    return { ...this.viewport };
  }

  /** World pixel -> screen pixel. Inverse of screenToWorld; keeps
   *  PERSPECTIVE_Y_SCALE private so callers that place screen-space effects
   *  (the night light pools) cannot drift out of sync with the transform. */
  worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    return {
      x: (worldX - this.x) * this.zoom,
      y: (worldY - this.y) * this.zoom * PERSPECTIVE_Y_SCALE,
    };
  }

  /** Visible world rect expressed in TILES. Keeps PERSPECTIVE_Y_SCALE private
   *  to this class — callers that draw a viewport box (the minimap) must not
   *  re-derive it and drift out of sync. */
  getViewRectTiles(): { x: number; y: number; w: number; h: number } {
    const topLeft = this.screenToWorld(this.viewport.x, this.viewport.y);
    return {
      x: topLeft.x / TILE_SIZE,
      y: topLeft.y / TILE_SIZE,
      w: this.viewport.w / this.zoom / TILE_SIZE,
      h: this.viewport.h / (this.zoom * PERSPECTIVE_Y_SCALE) / TILE_SIZE,
    };
  }

  /** Put a world point in the middle of the visible viewport. */
  centerOn(worldPixelX: number, worldPixelY: number): void {
    const v = this.viewport;
    this.x = worldPixelX - (v.x + v.w / 2) / this.zoom;
    this.y = worldPixelY - (v.y + v.h / 2) / (this.zoom * PERSPECTIVE_Y_SCALE);
    this.clamp();
  }

  private viewportCenterWorld(): { x: number; y: number } {
    const v = this.viewport;
    return this.screenToWorld(v.x + v.w / 2, v.y + v.h / 2);
  }

  /** Keep the VISIBLE viewport on the map (with a little edge slack). */
  private clamp(): void {
    const v = this.viewport;
    const viewW = v.w / this.zoom;
    const viewH = v.h / (this.zoom * PERSPECTIVE_Y_SCALE);
    const left = Camera.clampAxis(this.x + v.x / this.zoom, viewW, this.worldWidth * TILE_SIZE);
    const top = Camera.clampAxis(this.y + v.y / (this.zoom * PERSPECTIVE_Y_SCALE), viewH, this.worldHeight * TILE_SIZE);
    this.x = left - v.x / this.zoom;
    this.y = top - v.y / (this.zoom * PERSPECTIVE_Y_SCALE);
  }

  /** Clamp the view's leading edge; a view wider than the padded world is centered instead. */
  private static clampAxis(start: number, viewSize: number, worldSize: number): number {
    const min = -EDGE_PADDING;
    const max = worldSize - viewSize + EDGE_PADDING;
    if (max < min) return (worldSize - viewSize) / 2;
    return Math.max(min, Math.min(max, start));
  }

  /**
   * Frame a scripted shot (the intro cinematic). From the first shot until
   * release() the camera belongs to the script: player pan, wheel zoom and
   * reset are ignored so they cannot fight it.
   */
  direct(shot: CameraShot): void {
    this.directed = true;
    this.zoom = snapZoom(shot.zoom, this.limits);
    this.centerOn(shot.x, shot.y);
  }

  /** Hand the camera back to the player, optionally on a last shot. */
  release(finalShot?: CameraShot): void {
    if (finalShot) {
      this.zoom = snapZoom(finalShot.zoom, this.limits);
      this.centerOn(finalShot.x, finalShot.y);
    }
    this.directed = false;
    this.wheelAccum = 0;
  }

  isDirected(): boolean {
    return this.directed;
  }

  /** Back to the default zoom with the world's top-left corner in view. */
  reset(): void {
    if (this.directed) return;
    this.zoom = this.defaultZoom;
    this.wheelAccum = 0;
    this.x = -this.viewport.x / this.zoom;
    this.y = -this.viewport.y / (this.zoom * PERSPECTIVE_Y_SCALE);
    this.clamp();
  }
}
