/**
 * A world-sized offscreen picture split into square chunks. One canvas the
 * size of the whole map broke the browsers' per-canvas area limit (16.7 M px
 * on iOS) once the map grew past ~147×110 tiles, so the terrain and foliage
 * caches paint into chunks instead and blit only the chunks in view.
 *
 * Each chunk's context is translated so callers paint in world px, as they
 * did on the single canvas.
 */
export class ChunkedCanvas {
  readonly width: number;
  readonly height: number;
  readonly chunkSize: number;
  readonly cols: number;
  readonly rows: number;
  private readonly chunks: Array<{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; x: number; y: number }> = [];

  constructor(width: number, height: number, chunkSize = 1024) {
    this.width = width;
    this.height = height;
    this.chunkSize = chunkSize;
    this.cols = Math.max(1, Math.ceil(width / chunkSize));
    this.rows = Math.max(1, Math.ceil(height / chunkSize));
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const x = col * chunkSize;
        const y = row * chunkSize;
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(chunkSize, width - x);
        canvas.height = Math.min(chunkSize, height - y);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not get 2d context for a chunk canvas');
        ctx.imageSmoothingEnabled = false;
        ctx.setTransform(1, 0, 0, 1, -x, -y);
        this.chunks.push({ canvas, ctx, x, y });
      }
    }
  }

  /**
   * Every chunk context overlapping the world px rect (x, y, w, h), already
   * translated to world px; a picture that spills over a seam is painted into
   * each chunk it touches.
   */
  contextsFor(x: number, y: number, w: number, h: number): CanvasRenderingContext2D[] {
    const c0 = Math.max(0, Math.floor(x / this.chunkSize));
    const r0 = Math.max(0, Math.floor(y / this.chunkSize));
    const c1 = Math.min(this.cols - 1, Math.floor((x + w - 1) / this.chunkSize));
    const r1 = Math.min(this.rows - 1, Math.floor((y + h - 1) / this.chunkSize));
    const out: CanvasRenderingContext2D[] = [];
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) out.push(this.chunks[r * this.cols + c].ctx);
    }
    return out;
  }

  /**
   * A stand-in context for PixelPainter (which only sets fillStyle and calls
   * fillRect): each rect lands in every chunk it overlaps, so pictures that
   * spill over a seam stay whole.
   */
  painter(): CanvasRenderingContext2D {
    let style: string | CanvasGradient | CanvasPattern = '#000';
    const router = {
      get fillStyle() { return style; },
      set fillStyle(value: string | CanvasGradient | CanvasPattern) { style = value; },
      fillRect: (x: number, y: number, w: number, h: number) => {
        for (const ctx of this.contextsFor(x, y, w, h)) {
          ctx.fillStyle = style;
          ctx.fillRect(x, y, w, h);
        }
      },
    };
    return router as unknown as CanvasRenderingContext2D;
  }

  /** Wipe every chunk */
  clear(): void {
    for (const chunk of this.chunks) {
      chunk.ctx.clearRect(chunk.x, chunk.y, chunk.canvas.width, chunk.canvas.height);
    }
  }

  /** Blit the chunks overlapping the world px view (all of them without one) */
  draw(target: CanvasRenderingContext2D, view?: { x: number; y: number; w: number; h: number }): void {
    for (const chunk of this.chunks) {
      if (view && (
        chunk.x + chunk.canvas.width <= view.x || chunk.x >= view.x + view.w
        || chunk.y + chunk.canvas.height <= view.y || chunk.y >= view.y + view.h
      )) continue;
      target.drawImage(chunk.canvas, chunk.x, chunk.y);
    }
  }
}
