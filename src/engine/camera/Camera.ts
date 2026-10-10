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

function clampZoom(zoom: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
}

/** Nearest 0.5 step inside the zoom limits. */
export function snapZoom(zoom: number): number {
  return clampZoom(Math.round(zoom / ZOOM_STEP) * ZOOM_STEP);
}

/** Next 0.5 step from `current` in `direction` (+1 zooms in, -1 zooms out); off-grid values land on the grid. */
export function stepZoom(current: number, direction: 1 | -1): number {
  const steps = current / ZOOM_STEP;
  const next = direction > 0 ? Math.floor(steps + 1e-9) + 1 : Math.ceil(steps - 1e-9) - 1;
  return clampZoom(next * ZOOM_STEP);
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
    this.zoom = stepZoom(this.zoom, delta > 0 ? -1 : 1);

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
    this.defaultZoom = snapZoom(zoom);
  }

  getDefaultZoom(): number {
    return this.defaultZoom;
  }

  /** Set the zoom directly (snapped to the 0.5 grid), keeping the viewport center fixed. */
  setZoom(zoom: number): void {
    const center = this.viewportCenterWorld();
    this.zoom = snapZoom(zoom);
    this.centerOn(center.x, center.y);
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
    this.zoom = snapZoom(shot.zoom);
    this.centerOn(shot.x, shot.y);
  }

  /** Hand the camera back to the player, optionally on a last shot. */
  release(finalShot?: CameraShot): void {
    if (finalShot) {
      this.zoom = snapZoom(finalShot.zoom);
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
