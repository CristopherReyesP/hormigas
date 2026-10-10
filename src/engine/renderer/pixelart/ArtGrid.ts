// ArtGrid — an off-DOM buffer of art pixels (palette hex colors, null = clear)
// plus two masks the sprite passes need: `body` (lit, outlined flesh/shell) and
// `solid` (the outlined silhouette that casts the ground shadow). Sprites are
// composed here, tested pixel by pixel, then blitted once into the atlas.

export class ArtGrid {
  readonly width: number;
  readonly height: number;
  private readonly colors: (string | null)[];
  private readonly body: Uint8Array;
  private readonly solid: Uint8Array;

  constructor(width: number, height: number = width) {
    this.width = width;
    this.height = height;
    this.colors = new Array<string | null>(width * height).fill(null);
    this.body = new Uint8Array(width * height);
    this.solid = new Uint8Array(width * height);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  get(x: number, y: number): string | null {
    return this.inBounds(x, y) ? this.colors[y * this.width + x] : null;
  }

  set(x: number, y: number, color: string | null): void {
    if (this.inBounds(x, y)) this.colors[y * this.width + x] = color;
  }

  isBody(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.body[y * this.width + x] === 1;
  }

  setBody(x: number, y: number, on: boolean): void {
    if (this.inBounds(x, y)) this.body[y * this.width + x] = on ? 1 : 0;
  }

  isSolid(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.solid[y * this.width + x] === 1;
  }

  setSolid(x: number, y: number, on: boolean): void {
    if (this.inBounds(x, y)) this.solid[y * this.width + x] = on ? 1 : 0;
  }
}

const rgbaCache = new Map<string, number>();

/** `#rrggbb` → packed 0xRRGGBB (cached; sprites reuse a few dozen palette colors). */
function rgbOf(hex: string): number {
  let v = rgbaCache.get(hex);
  if (v === undefined) {
    v = parseInt(hex.slice(1, 7), 16);
    rgbaCache.set(hex, v);
  }
  return v;
}

/**
 * Write `grid` into `ctx` at canvas (x, y), one canvas px per art px. Uses
 * ImageData, so it ignores the context transform and is fast enough to bake
 * hundreds of direction frames at load or when the colony mutates.
 */
export function blitArtGrid(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  grid: ArtGrid,
  x: number,
  y: number,
): void {
  const img = ctx.createImageData(grid.width, grid.height);
  const data = img.data;
  for (let gy = 0; gy < grid.height; gy++) {
    for (let gx = 0; gx < grid.width; gx++) {
      const c = grid.get(gx, gy);
      if (!c) continue;
      const v = rgbOf(c);
      const o = (gy * grid.width + gx) * 4;
      data[o] = (v >> 16) & 255;
      data[o + 1] = (v >> 8) & 255;
      data[o + 2] = v & 255;
      data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, x, y);
}
