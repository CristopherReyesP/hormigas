import { CANVAS_WIDTH, CANVAS_HEIGHT, WORLD_WIDTH, WORLD_HEIGHT, TILE_SIZE } from '../../shared/constants';

// Foreshortening is screen-space, after the camera quarter turn.
const TILT_SCALES = [1, 0.75, 0.55] as const;

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

  private rotation = 0;
  private tilt = 0;

  private worldWidth: number;
  private worldHeight: number;
  /** Top-left tile of the area the view stays on (the whole map, or Phase 1's zone) */
  private areaX = 0;
  private areaY = 0;
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

  /**
   * Keep the view on part of the map (tiles): Phase 1's walled zone, then the
   * whole map once the frontier opens. The zoom-out limit follows the area.
   */
  setWorldArea(x: number, y: number, width: number, height: number): void {
    this.areaX = x;
    this.areaY = y;
    this.worldWidth = Math.max(1, width);
    this.worldHeight = Math.max(1, height);
    this.setCanvasSize(this.canvasW, this.canvasH, this.pixelRatio);
  }

  /** The area the view stays on, in tiles */
  getWorldArea(): { x: number; y: number; width: number; height: number } {
    return { x: this.areaX, y: this.areaY, width: this.worldWidth, height: this.worldHeight };
  }

  getRotation(): number {
    return this.rotation;
  }

  getTilt(): number {
    return this.tilt;
  }

  getTiltScale(): number {
    return TILT_SCALES[this.tilt];
  }

  /** Raise the camera towards a top-down view. */
  tiltUp(): void {
    this.changeTilt(-1);
  }

  /** Lower the camera towards the ground. */
  tiltDown(): void {
    this.changeTilt(1);
  }

  private changeTilt(delta: number): void {
    if (this.directed) return;
    const next = Math.max(0, Math.min(TILT_SCALES.length - 1, this.tilt + delta));
    if (next === this.tilt) return;
    const center = this.viewportCenterWorld();
    this.tilt = next;
    this.updateLimits();
    this.zoom = snapZoom(this.zoom, this.limits);
    // As with rotation, preserve the pivot even when it is near a map edge.
    this.x = center.x - (this.viewport.x + this.viewport.w / 2) / this.zoom;
    this.y = center.y - (this.viewport.y + this.viewport.h / 2) / this.zoom;
  }

  rotateCW(): void {
    if (!this.directed) this.rotate(1);
  }

  rotateCCW(): void {
    if (!this.directed) this.rotate(3);
  }

  private rotate(turns: number): void {
    const center = this.viewportCenterWorld();
    this.rotation = (this.rotation + turns) % 4;
    this.updateLimits();
    this.zoom = snapZoom(this.zoom, this.limits);
    // Do not clamp on a turn: even at an edge, the pivot must remain fixed.
    this.x = center.x - (this.viewport.x + this.viewport.w / 2) / this.zoom;
    this.y = center.y - (this.viewport.y + this.viewport.h / 2) / this.zoom;
  }

  private updateLimits(): void {
    const odd = this.rotation % 2 !== 0;
    const unsquashedHeight = this.canvasH / this.getTiltScale();
    this.limits = zoomLimits(odd ? unsquashedHeight : this.canvasW, odd ? this.canvasW : unsquashedHeight,
      this.pixelRatio, this.worldWidth * TILE_SIZE, this.worldHeight * TILE_SIZE);
  }

  /** Exact quarter-turn vectors avoid trigonometric drift in pixel art. */
  private rotateVector(x: number, y: number, inverse = false): { x: number; y: number } {
    const turn = inverse ? (4 - this.rotation) % 4 : this.rotation;
    switch (turn) {
      case 1: return { x: -y, y: x };
      case 2: return { x: -x, y: -y };
      case 3: return { x: y, y: -x };
      default: return { x, y };
    }
  }

  applyTransform(ctx: CanvasRenderingContext2D): void {
    if (this.tilt !== 0) {
      const cy = this.viewport.y + this.viewport.h / 2;
      ctx.translate(0, cy);
      ctx.scale(1, this.getTiltScale());
      ctx.translate(0, -cy);
    }
    if (this.rotation !== 0) {
      const cx = this.viewport.x + this.viewport.w / 2;
      const cy = this.viewport.y + this.viewport.h / 2;
      const axis = this.rotateVector(1, 0);
      ctx.translate(cx, cy);
      ctx.transform(axis.x, axis.y, -axis.y, axis.x, 0, 0);
      ctx.translate(-cx, -cy);
    }
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.x, -this.y);
  }

  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    const cx = this.viewport.x + this.viewport.w / 2;
    const cy = this.viewport.y + this.viewport.h / 2;
    const p = this.rotateVector(screenX - cx, (screenY - cy) / this.getTiltScale(), true);
    return {
      x: (p.x + cx) / this.zoom + this.x,
      y: (p.y + cy) / this.zoom + this.y,
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
    const delta = this.rotateVector(screenDx, screenDy / this.getTiltScale(), true);
    this.x -= delta.x / this.zoom;
    this.y -= delta.y / this.zoom;
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
    const worldAfter = this.screenToWorld(screenX, screenY);
    this.x += worldBefore.x - worldAfter.x;
    this.y += worldBefore.y - worldAfter.y;
    this.clamp();
  }

  /**
   * Pinch zoom: go to `zoom` (snapped to the 0.5 grid) keeping the world
   * point under (screenX, screenY) where it is. Ignored while a cinematic
   * owns the camera.
   */
  zoomTo(screenX: number, screenY: number, zoom: number): void {
    if (this.directed) return;
    const next = snapZoom(zoom, this.limits);
    if (next === this.zoom) return;
    const worldBefore = this.screenToWorld(screenX, screenY);
    this.zoom = next;
    const worldAfter = this.screenToWorld(screenX, screenY);
    this.x += worldBefore.x - worldAfter.x;
    this.y += worldBefore.y - worldAfter.y;
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
    this.updateLimits();
    this.zoom = snapZoom(zoom, this.limits);
    this.defaultZoom = snapZoom(this.defaultZoom, this.limits);
    this.centerOn(center.x, center.y);
  }

  /** Canvas px per CSS px, as set by setCanvasSize */
  getPixelRatio(): number {
    return this.pixelRatio;
  }

  getCanvasSize(): { width: number; height: number } {
    return { width: this.canvasW, height: this.canvasH };
  }

  getZoomLimits(): ZoomLimits {
    return { ...this.limits };
  }

  /** World px rect the WHOLE canvas shows (the HUD bars included): the culling bounds. */
  getCanvasWorldRect(): { x: number; y: number; w: number; h: number } {
    return this.worldRect({ x: 0, y: 0, w: this.canvasW, h: this.canvasH });
  }

  private worldRect(rect: ViewportRect): ViewportRect {
    const points = [
      this.screenToWorld(rect.x, rect.y),
      this.screenToWorld(rect.x + rect.w, rect.y),
      this.screenToWorld(rect.x, rect.y + rect.h),
      this.screenToWorld(rect.x + rect.w, rect.y + rect.h),
    ];
    const x = Math.min(...points.map(p => p.x));
    const y = Math.min(...points.map(p => p.y));
    return { x, y, w: Math.max(...points.map(p => p.x)) - x, h: Math.max(...points.map(p => p.y)) - y };
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
   *  the tilt projection private so callers that place screen-space effects
   *  (the night light pools) cannot drift out of sync with the transform. */
  worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    const cx = this.viewport.x + this.viewport.w / 2;
    const cy = this.viewport.y + this.viewport.h / 2;
    const p = this.rotateVector((worldX - this.x) * this.zoom - cx, (worldY - this.y) * this.zoom - cy);
    return { x: p.x + cx, y: p.y * this.getTiltScale() + cy };
  }

  /** Visible world rect expressed in TILES. Keeps the tilt projection private
   *  to this class — callers that draw a viewport box (the minimap) must not
   *  re-derive it and drift out of sync. */
  getViewRectTiles(): { x: number; y: number; w: number; h: number } {
    const rect = this.worldRect(this.viewport);
    return { x: rect.x / TILE_SIZE, y: rect.y / TILE_SIZE, w: rect.w / TILE_SIZE, h: rect.h / TILE_SIZE };
  }

  /** Put a world point in the middle of the visible viewport. */
  centerOn(worldPixelX: number, worldPixelY: number): void {
    const v = this.viewport;
    this.x = worldPixelX - (v.x + v.w / 2) / this.zoom;
    this.y = worldPixelY - (v.y + v.h / 2) / this.zoom;
    this.clamp();
  }

  private viewportCenterWorld(): { x: number; y: number } {
    const v = this.viewport;
    return this.screenToWorld(v.x + v.w / 2, v.y + v.h / 2);
  }

  /** Keep the VISIBLE viewport on the map (with a little edge slack). */
  private clamp(): void {
    const view = this.worldRect(this.viewport);
    const ox = this.areaX * TILE_SIZE;
    const oy = this.areaY * TILE_SIZE;
    this.x += ox + Camera.clampAxis(view.x - ox, view.w, this.worldWidth * TILE_SIZE) - view.x;
    this.y += oy + Camera.clampAxis(view.y - oy, view.h, this.worldHeight * TILE_SIZE) - view.y;
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

  /** Back to the default zoom with the area's top-left corner in view. */
  reset(): void {
    if (this.directed) return;
    this.rotation = 0;
    this.tilt = 0;
    this.updateLimits();
    this.zoom = snapZoom(this.defaultZoom, this.limits);
    this.wheelAccum = 0;
    this.x = this.areaX * TILE_SIZE - this.viewport.x / this.zoom;
    this.y = this.areaY * TILE_SIZE - this.viewport.y / this.zoom;
    this.clamp();
  }
}
