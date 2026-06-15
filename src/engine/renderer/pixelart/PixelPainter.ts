// PixelPainter — draws on a logical pixel grid, scaled to real canvas pixels.
// Every sprite/tile is authored in "art pixels"; `scale` maps one art pixel to
// an N×N block of canvas pixels. All coordinates are art-pixel integers.
//
// CONVENTIONS (apply to every sprite in the game):
//  - Outline silhouettes with PAL.outline, 1 art pixel thick.
//  - Shade with ramp steps + dither(), never with rgba alpha or gradients.
//  - Light source is top-left: light ramp colors up-left, dark down-right.
//  - No anti-aliasing: only px/rect/line/disc/ellipse below, never ctx.arc.

export class PixelPainter {
  private ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  private scale: number;
  private originX: number;
  private originY: number;

  constructor(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    scale: number,
    originX = 0,
    originY = 0,
  ) {
    this.ctx = ctx;
    this.scale = scale;
    this.originX = originX;
    this.originY = originY;
  }

  /** Move the grid origin (canvas pixels) — useful for sprite-sheet frames. */
  at(originX: number, originY: number): PixelPainter {
    return new PixelPainter(this.ctx, this.scale, originX, originY);
  }

  px(x: number, y: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(
      this.originX + x * this.scale,
      this.originY + y * this.scale,
      this.scale,
      this.scale,
    );
  }

  rect(x: number, y: number, w: number, h: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(
      this.originX + x * this.scale,
      this.originY + y * this.scale,
      w * this.scale,
      h * this.scale,
    );
  }

  hline(x: number, y: number, len: number, color: string): void {
    this.rect(x, y, len, 1, color);
  }

  vline(x: number, y: number, len: number, color: string): void {
    this.rect(x, y, 1, len, color);
  }

  /** 1-art-pixel-thick rectangle border. */
  outlineRect(x: number, y: number, w: number, h: number, color: string): void {
    this.hline(x, y, w, color);
    this.hline(x, y + h - 1, w, color);
    this.vline(x, y + 1, h - 2, color);
    this.vline(x + w - 1, y + 1, h - 2, color);
  }

  /** Checkerboard dither blend between two colors. `phase` flips the pattern. */
  dither(x: number, y: number, w: number, h: number, colorA: string, colorB: string, phase = 0): void {
    for (let iy = 0; iy < h; iy++) {
      for (let ix = 0; ix < w; ix++) {
        this.px(x + ix, y + iy, (ix + iy + phase) % 2 === 0 ? colorA : colorB);
      }
    }
  }

  /** Bresenham line, 1 art pixel thick. */
  line(x0: number, y0: number, x1: number, y1: number, color: string): void {
    let cx = Math.round(x0);
    let cy = Math.round(y0);
    const tx = Math.round(x1);
    const ty = Math.round(y1);
    const dx = Math.abs(tx - cx);
    const dy = -Math.abs(ty - cy);
    const sx = cx < tx ? 1 : -1;
    const sy = cy < ty ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.px(cx, cy, color);
      if (cx === tx && cy === ty) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; cx += sx; }
      if (e2 <= dx) { err += dx; cy += sy; }
    }
  }

  /** Filled rasterized circle (midpoint-style, no anti-aliasing). */
  disc(cx: number, cy: number, r: number, color: string): void {
    const r2 = (r + 0.25) * (r + 0.25);
    for (let iy = -Math.ceil(r); iy <= Math.ceil(r); iy++) {
      for (let ix = -Math.ceil(r); ix <= Math.ceil(r); ix++) {
        if (ix * ix + iy * iy <= r2) this.px(cx + ix, cy + iy, color);
      }
    }
  }

  /** Filled rasterized ellipse. */
  ellipse(cx: number, cy: number, rx: number, ry: number, color: string): void {
    if (rx <= 0 || ry <= 0) return;
    for (let iy = -Math.ceil(ry); iy <= Math.ceil(ry); iy++) {
      for (let ix = -Math.ceil(rx); ix <= Math.ceil(rx); ix++) {
        const nx = ix / (rx + 0.25);
        const ny = iy / (ry + 0.25);
        if (nx * nx + ny * ny <= 1) this.px(cx + ix, cy + iy, color);
      }
    }
  }

  /** 1-art-pixel-thick circle outline. */
  ring(cx: number, cy: number, r: number, color: string): void {
    let x = Math.round(r);
    let y = 0;
    let err = 1 - x;
    while (x >= y) {
      this.px(cx + x, cy + y, color); this.px(cx - x, cy + y, color);
      this.px(cx + x, cy - y, color); this.px(cx - x, cy - y, color);
      this.px(cx + y, cy + x, color); this.px(cx - y, cy + x, color);
      this.px(cx + y, cy - x, color); this.px(cx - y, cy - x, color);
      y++;
      if (err < 0) {
        err += 2 * y + 1;
      } else {
        x--;
        err += 2 * (y - x) + 1;
      }
    }
  }

  /** Dithered shadow ellipse (replaces soft rgba shadows). */
  shadow(cx: number, cy: number, rx: number, ry: number, color: string): void {
    for (let iy = -Math.ceil(ry); iy <= Math.ceil(ry); iy++) {
      for (let ix = -Math.ceil(rx); ix <= Math.ceil(rx); ix++) {
        const nx = ix / (rx + 0.25);
        const ny = iy / (ry + 0.25);
        if (nx * nx + ny * ny <= 1 && (ix + iy) % 2 === 0) this.px(cx + ix, cy + iy, color);
      }
    }
  }
}
