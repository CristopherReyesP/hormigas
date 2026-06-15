import { CANVAS_WIDTH, CANVAS_HEIGHT, TILE_SIZE } from '../../shared/constants';

export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2d context');
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
  }

  clear(): void {
    this.ctx.fillStyle = '#1a1205';
    this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }

  fillTile(tileX: number, tileY: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(
      tileX * TILE_SIZE,
      tileY * TILE_SIZE,
      TILE_SIZE,
      TILE_SIZE
    );
  }

  fillCircle(x: number, y: number, radius: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.arc(
      x * TILE_SIZE + TILE_SIZE / 2,
      y * TILE_SIZE + TILE_SIZE / 2,
      radius * TILE_SIZE,
      0,
      Math.PI * 2
    );
    this.ctx.fill();
  }

  fillRect(x: number, y: number, w: number, h: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, w, h);
  }

  drawText(text: string, x: number, y: number, color = '#fff', size = 12): void {
    this.ctx.fillStyle = color;
    this.ctx.font = `${size}px monospace`;
    this.ctx.fillText(text, x, y);
  }

  getContext(): CanvasRenderingContext2D {
    return this.ctx;
  }

  drawImage(image: HTMLCanvasElement | HTMLImageElement, dx: number, dy: number): void {
    this.ctx.drawImage(image, dx, dy);
  }

  // Helper to draw at pixel coordinates (not tile coordinates)
  drawAtPixels(callback: (ctx: CanvasRenderingContext2D) => void): void {
    callback(this.ctx);
  }
}
