import { WORLD_WIDTH, WORLD_HEIGHT, TILE_SIZE } from '../../shared/constants';
import type { VisibilityGrid } from '../../simulation/world/VisibilityGrid';

// Quantized fog levels — pixel art reads as stepped bands, not smooth fades.
// Per-tile alpha snaps to one of exactly three levels: 0 / 0.45 / 0.9.
const FOG_UNEXPLORED = 230; // 0.9
const FOG_EXPLORED = 115; // 0.45
const BRIGHTNESS_CLEAR_THRESHOLD = 128; // >= half-bright snaps to fully clear

export class FogRenderer {
  private fogCanvas: HTMLCanvasElement;
  private fogCtx: CanvasRenderingContext2D;
  private fogImageData: ImageData;

  private visibilityGrid: VisibilityGrid;

  constructor(visibilityGrid: VisibilityGrid) {
    this.visibilityGrid = visibilityGrid;
    this.fogCanvas = document.createElement('canvas');
    this.fogCanvas.width = WORLD_WIDTH;
    this.fogCanvas.height = WORLD_HEIGHT;
    this.fogCtx = this.fogCanvas.getContext('2d')!;
    this.fogImageData = this.fogCtx.createImageData(WORLD_WIDTH, WORLD_HEIGHT);

    // Initialize fully black (unexplored)
    const data = this.fogImageData.data;
    for (let i = 0; i < WORLD_WIDTH * WORLD_HEIGHT; i++) {
      data[i * 4 + 3] = FOG_UNEXPLORED;
    }
    this.fogCtx.putImageData(this.fogImageData, 0, 0);
  }

  update(): void {
    const data = this.fogImageData.data;
    const grid = this.visibilityGrid;

    for (let y = 0; y < WORLD_HEIGHT; y++) {
      for (let x = 0; x < WORLD_WIDTH; x++) {
        const idx = y * WORLD_WIDTH + x;
        const pixelIdx = idx * 4;

        const explored = grid.isExplored(x, y);
        const brightness = grid.getBrightness(x, y);

        // Snap to one of 3 discrete levels — no smooth gradient between tiles
        let alpha: number;
        if (!explored) {
          alpha = FOG_UNEXPLORED;
        } else if (brightness >= BRIGHTNESS_CLEAR_THRESHOLD) {
          alpha = 0;
        } else {
          alpha = FOG_EXPLORED;
        }

        data[pixelIdx + 3] = alpha;
      }
    }

    this.fogCtx.putImageData(this.fogImageData, 0, 0);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    // Smoothing OFF: fog edges must read as crisp per-tile pixel bands
    const prevSmoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      this.fogCanvas,
      0, 0, WORLD_WIDTH, WORLD_HEIGHT,
      0, 0, WORLD_WIDTH * TILE_SIZE, WORLD_HEIGHT * TILE_SIZE
    );
    ctx.imageSmoothingEnabled = prevSmoothing;
  }
}
