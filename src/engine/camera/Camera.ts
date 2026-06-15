import { CANVAS_WIDTH, CANVAS_HEIGHT, WORLD_WIDTH, WORLD_HEIGHT, TILE_SIZE } from '../../shared/constants';

const PERSPECTIVE_Y_SCALE = 0.85;

// Pixel art shimmers at fractional zoom — snap to fixed steps.
const ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2, 3, 4] as const;

export class Camera {
  x = 0;  // world pixel offset (top-left corner of viewport)
  y = 0;
  zoom = 1;

  private minZoom = 0.5;
  private maxZoom = 4;
  private worldWidth: number;
  private worldHeight: number;

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
    this.x -= screenDx / this.zoom;
    this.y -= screenDy / (this.zoom * PERSPECTIVE_Y_SCALE);
    this.clamp();
  }

  zoomAt(screenX: number, screenY: number, delta: number): void {
    const worldBefore = this.screenToWorld(screenX, screenY);

    // Snap to the next zoom step in the direction of the wheel delta.
    // delta > 0 → zoom out (smaller), delta < 0 → zoom in (larger).
    const next = delta > 0
      ? [...ZOOM_STEPS].reverse().find((s) => s < this.zoom - 1e-9) ?? ZOOM_STEPS[0]
      : ZOOM_STEPS.find((s) => s > this.zoom + 1e-9) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, next));

    // Keep world point under mouse cursor stationary
    this.x = worldBefore.x - screenX / this.zoom;
    this.y = worldBefore.y - screenY / (this.zoom * PERSPECTIVE_Y_SCALE);
    this.clamp();
  }

  getZoom(): number {
    return this.zoom;
  }

  centerOn(worldPixelX: number, worldPixelY: number): void {
    const viewW = CANVAS_WIDTH / this.zoom;
    const viewH = CANVAS_HEIGHT / (this.zoom * PERSPECTIVE_Y_SCALE);
    this.x = worldPixelX - viewW / 2;
    this.y = worldPixelY - viewH / 2;
    this.clamp();
  }

  private clamp(): void {
    const worldPixelW = this.worldWidth * TILE_SIZE;
    const worldPixelH = this.worldHeight * TILE_SIZE;
    const viewW = CANVAS_WIDTH / this.zoom;
    const viewH = CANVAS_HEIGHT / (this.zoom * PERSPECTIVE_Y_SCALE);

    const padding = 50;
    this.x = Math.max(-padding, Math.min(worldPixelW - viewW + padding, this.x));
    this.y = Math.max(-padding, Math.min(worldPixelH - viewH + padding, this.y));
  }

  reset(): void {
    this.x = 0;
    this.y = 0;
    this.zoom = 1;
  }
}
