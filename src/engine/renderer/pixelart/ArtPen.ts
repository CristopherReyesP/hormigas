// ArtPen — paints a sprite recipe onto an ArtGrid, already turned to one of the
// pre-baked facing directions. Recipes are authored facing right (angle 0) in
// art-pixel coordinates, exactly like PixelPainter; the pen re-rasterizes each
// primitive in the turned frame instead of rotating finished pixels, so every
// direction gets clean 1-px lines, hole-free fills and square art pixels.
//
// Light is a screen-space pass (shade, sheen, castShadow) applied AFTER the
// turn, so the top-left highlight and the ground shadow never rotate with the
// sprite.
import type { ArtGrid } from './ArtGrid';

/** A point in art-pixel coordinates of the authoring frame. */
export type ArtPoint = readonly [number, number];

/** Rotation pivot of a grid axis: the centre of its middle pixel. */
export function gridPivot(size: number): number {
  return Math.floor(size / 2) + 0.5;
}

/** Kill float noise so quarter turns land on exact pixels. */
function clean(v: number): number {
  if (Math.abs(v) < 1e-12) return 0;
  if (Math.abs(v - 1) < 1e-12) return 1;
  if (Math.abs(v + 1) < 1e-12) return -1;
  return v;
}

const NEIGHBOURS_8: ReadonlyArray<ArtPoint> = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

export class ArtPen {
  readonly grid: ArtGrid;
  private readonly cos: number;
  private readonly sin: number;
  private readonly pivotX: number;
  private readonly pivotY: number;
  /** Pixels painted by the open outlined() group, or null outside one. */
  private group: Uint8Array | null = null;

  constructor(grid: ArtGrid, angle = 0, pivotX = gridPivot(grid.width), pivotY = gridPivot(grid.height)) {
    this.grid = grid;
    this.cos = clean(Math.cos(angle));
    this.sin = clean(Math.sin(angle));
    this.pivotX = pivotX;
    this.pivotY = pivotY;
  }

  // ─── Frame mapping ─────────────────────────────────────────

  /** Grid pixel that authoring pixel (x, y) lands on after the turn. */
  toGrid(x: number, y: number): [number, number] {
    const dx = x + 0.5 - this.pivotX;
    const dy = y + 0.5 - this.pivotY;
    return [
      Math.floor(this.pivotX + this.cos * dx - this.sin * dy),
      Math.floor(this.pivotY + this.sin * dx + this.cos * dy),
    ];
  }

  private plot(x: number, y: number, color: string): void {
    if (!this.grid.inBounds(x, y)) return;
    this.grid.set(x, y, color);
    if (this.group) this.group[y * this.grid.width + x] = 1;
  }

  /**
   * Fill every grid pixel whose centre, turned back into the authoring frame,
   * passes `inside`. [x0,x1]×[y0,y1] bounds the shape in continuous authoring
   * coordinates (pixel (x, y) covers [x, x+1)).
   */
  private fillArea(
    x0: number, y0: number, x1: number, y1: number,
    inside: (sx: number, sy: number) => boolean,
    color: string | ((gx: number, gy: number) => string | null),
  ): void {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [cx, cy] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
      const dx = cx - this.pivotX;
      const dy = cy - this.pivotY;
      const gx = this.pivotX + this.cos * dx - this.sin * dy;
      const gy = this.pivotY + this.sin * dx + this.cos * dy;
      minX = Math.min(minX, gx); maxX = Math.max(maxX, gx);
      minY = Math.min(minY, gy); maxY = Math.max(maxY, gy);
    }
    const fromX = Math.max(0, Math.floor(minX) - 1);
    const toX = Math.min(this.grid.width - 1, Math.ceil(maxX) + 1);
    const fromY = Math.max(0, Math.floor(minY) - 1);
    const toY = Math.min(this.grid.height - 1, Math.ceil(maxY) + 1);
    for (let gy = fromY; gy <= toY; gy++) {
      for (let gx = fromX; gx <= toX; gx++) {
        const ux = gx + 0.5 - this.pivotX;
        const uy = gy + 0.5 - this.pivotY;
        const sx = this.pivotX + this.cos * ux + this.sin * uy;
        const sy = this.pivotY - this.sin * ux + this.cos * uy;
        if (!inside(sx, sy)) continue;
        const c = typeof color === 'string' ? color : color(gx, gy);
        if (c) this.plot(gx, gy, c);
      }
    }
  }

  // ─── Primitives (authoring-frame art pixels) ───────────────

  px(x: number, y: number, color: string): void {
    const [gx, gy] = this.toGrid(Math.round(x), Math.round(y));
    this.plot(gx, gy, color);
  }

  /** Bresenham line between the turned end pixels: 1 px thick, never broken. */
  line(x0: number, y0: number, x1: number, y1: number, color: string): void {
    let [cx, cy] = this.toGrid(Math.round(x0), Math.round(y0));
    const [tx, ty] = this.toGrid(Math.round(x1), Math.round(y1));
    const dx = Math.abs(tx - cx);
    const dy = -Math.abs(ty - cy);
    const sx = cx < tx ? 1 : -1;
    const sy = cy < ty ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.plot(cx, cy, color);
      if (cx === tx && cy === ty) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; cx += sx; }
      if (e2 <= dx) { err += dx; cy += sy; }
    }
  }

  polyline(points: readonly ArtPoint[], color: string): void {
    for (let i = 1; i < points.length; i++) {
      this.line(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1], color);
    }
  }

  hline(x: number, y: number, len: number, color: string): void {
    if (len > 0) this.line(x, y, x + len - 1, y, color);
  }

  vline(x: number, y: number, len: number, color: string): void {
    if (len > 0) this.line(x, y, x, y + len - 1, color);
  }

  rect(x: number, y: number, w: number, h: number, color: string): void {
    if (w <= 0 || h <= 0) return;
    if (w === 1) return this.vline(x, y, h, color);
    if (h === 1) return this.hline(x, y, w, color);
    this.fillArea(x, y, x + w, y + h, (sx, sy) => sx >= x && sx < x + w && sy >= y && sy < y + h, color);
  }

  /** Filled ellipse, same radius + 0.25 rule as PixelPainter. Fractional centres are fine. */
  ellipse(cx: number, cy: number, rx: number, ry: number, color: string): void {
    if (rx <= 0 || ry <= 0) return;
    const ox = cx + 0.5;
    const oy = cy + 0.5;
    const a = rx + 0.25;
    const b = ry + 0.25;
    this.fillArea(ox - a, oy - b, ox + a, oy + b, (sx, sy) => {
      const nx = (sx - ox) / a;
      const ny = (sy - oy) / b;
      return nx * nx + ny * ny <= 1;
    }, color);
  }

  disc(cx: number, cy: number, r: number, color: string): void {
    this.ellipse(cx, cy, r, r, color);
  }

  /** Thick segment with round caps (femurs, scythes, horns): radius r around the centre line. */
  capsule(x0: number, y0: number, x1: number, y1: number, r: number, color: string): void {
    const ax = x0 + 0.5, ay = y0 + 0.5, bx = x1 + 0.5, by = y1 + 0.5;
    const vx = bx - ax, vy = by - ay;
    const len2 = vx * vx + vy * vy || 1;
    const rr = (r + 0.25) * (r + 0.25);
    this.fillArea(Math.min(ax, bx) - r - 1, Math.min(ay, by) - r - 1, Math.max(ax, bx) + r + 1, Math.max(ay, by) + r + 1, (sx, sy) => {
      const t = Math.max(0, Math.min(1, ((sx - ax) * vx + (sy - ay) * vy) / len2));
      const ex = sx - (ax + t * vx);
      const ey = sy - (ay + t * vy);
      return ex * ex + ey * ey <= rr;
    }, color);
  }

  /** Filled polygon through the given pixel centres (even-odd rule). */
  poly(points: readonly ArtPoint[], color: string): void {
    const vs = points.map(([x, y]) => [x + 0.5, y + 0.5] as const);
    const xs = vs.map(v => v[0]);
    const ys = vs.map(v => v[1]);
    this.fillArea(Math.min(...xs) - 0.5, Math.min(...ys) - 0.5, Math.max(...xs) + 0.5, Math.max(...ys) + 0.5, (sx, sy) => {
      let inside = false;
      for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        const [xi, yi] = vs[i];
        const [xj, yj] = vs[j];
        if ((yi > sy) !== (yj > sy) && sx < ((xj - xi) * (sy - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    }, color);
  }

  /** Checkerboard blend over an authoring-frame rect, on the grid's own checker so it stays clean when turned. */
  dither(x: number, y: number, w: number, h: number, colorA: string, colorB: string, phase = 0): void {
    if (w <= 0 || h <= 0) return;
    this.fillArea(x, y, x + w, y + h, (sx, sy) => sx >= x && sx < x + w && sy >= y && sy < y + h,
      (gx, gy) => ((gx + gy + phase) % 2 === 0 ? colorA : colorB));
  }

  /** Dithered ellipse in one color (half the pixels), for soft ground shadows. */
  shadow(cx: number, cy: number, rx: number, ry: number, color: string): void {
    const ox = cx + 0.5;
    const oy = cy + 0.5;
    const a = rx + 0.25;
    const b = ry + 0.25;
    this.fillArea(ox - a, oy - b, ox + a, oy + b, (sx, sy) => {
      const nx = (sx - ox) / a;
      const ny = (sy - oy) / b;
      return nx * nx + ny * ny <= 1;
    }, (gx, gy) => ((gx + gy) % 2 === 0 ? color : null));
  }

  // ─── Silhouettes and light (grid space) ────────────────────

  /**
   * Paint `draw` as one silhouette: its pixels become body, then a 1-px ring
   * of `outline` is drawn around their union, over anything already there
   * (like stamping the shape 8 times offset by one art pixel).
   */
  outlined(draw: (pen: ArtPen) => void, outline: string): void {
    const { width, height } = this.grid;
    const group = new Uint8Array(width * height);
    const outer = this.group;
    this.group = group;
    draw(this);
    this.group = outer;

    const ring: number[] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (group[y * width + x]) continue;
        for (const [dx, dy] of NEIGHBOURS_8) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < width && ny < height && group[ny * width + nx]) {
            ring.push(y * width + x);
            break;
          }
        }
      }
    }
    for (const i of ring) {
      const x = i % width;
      const y = (i - x) / width;
      this.grid.set(x, y, outline);
      this.grid.setBody(x, y, false);
      this.grid.setSolid(x, y, true);
      if (outer) outer[i] = 1;
    }
    for (let i = 0; i < group.length; i++) {
      if (!group[i]) continue;
      const x = i % width;
      const y = (i - x) / width;
      this.grid.setBody(x, y, true);
      this.grid.setSolid(x, y, true);
      if (outer) outer[i] = 1;
    }
  }

  /**
   * Top-left light, applied after the turn: body pixels exposed to the
   * top-left step one tone up their ramp, pixels exposed to the bottom-right
   * step one tone down. Colors outside `ramps` (glow, eyes) are left alone.
   */
  shade(ramps: ReadonlyArray<readonly string[]>): void {
    const step = new Map<string, readonly [string, string]>();
    for (const ramp of ramps) {
      for (let i = 0; i < ramp.length; i++) {
        if (!step.has(ramp[i])) step.set(ramp[i], [ramp[Math.max(0, i - 1)], ramp[Math.min(ramp.length - 1, i + 1)]]);
      }
    }
    const g = this.grid;
    const changes: Array<[number, number, string]> = [];
    for (let y = 0; y < g.height; y++) {
      for (let x = 0; x < g.width; x++) {
        const c = g.get(x, y);
        if (!c || !g.isBody(x, y)) continue;
        const tones = step.get(c);
        if (!tones) continue;
        const lit = !g.isBody(x - 1, y) || !g.isBody(x, y - 1);
        const shaded = !g.isBody(x + 1, y) || !g.isBody(x, y + 1);
        if (lit && !shaded) changes.push([x, y, tones[1]]);
        else if (shaded && !lit) changes.push([x, y, tones[0]]);
      }
    }
    for (const [x, y, c] of changes) g.set(x, y, c);
  }

  /** A specular dot `offset` px up-left (screen space) of the turned dome centre. */
  sheen(x: number, y: number, offset: number, color: string): void {
    const [gx, gy] = this.toGrid(x, y);
    if (this.grid.isBody(gx - offset, gy - offset)) this.grid.set(gx - offset, gy - offset, color);
  }

  /** Dithered ground shadow of the outlined silhouette, cast (dx, dy) px in screen space onto clear pixels. */
  castShadow(color: string, dx: number, dy: number): void {
    const g = this.grid;
    const cast: Array<[number, number]> = [];
    for (let y = 0; y < g.height; y++) {
      for (let x = 0; x < g.width; x++) {
        if ((x + y) % 2 !== 0 || g.get(x, y) !== null) continue;
        if (g.isSolid(x - dx, y - dy)) cast.push([x, y]);
      }
    }
    for (const [x, y] of cast) g.set(x, y, color);
  }
}
