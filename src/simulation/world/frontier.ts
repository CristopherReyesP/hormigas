/** A tile rect, inclusive on both ends */
export interface TileBounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The whole map */
export function fullBounds(width: number, height: number): TileBounds {
  return { x0: 0, y0: 0, x1: width - 1, y1: height - 1 };
}

/** A `zoneW`×`zoneH` rect centered on the map (Phase 1's zone, its wall included) */
export function centeredZone(width: number, height: number, zoneW: number, zoneH: number): TileBounds {
  const w = Math.min(width, zoneW);
  const h = Math.min(height, zoneH);
  const x0 = Math.floor((width - w) / 2);
  const y0 = Math.floor((height - h) / 2);
  return { x0, y0, x1: x0 + w - 1, y1: y0 + h - 1 };
}

/** The rect shrunk by `by` tiles on every side */
export function insetBounds(b: TileBounds, by: number): TileBounds {
  return { x0: b.x0 + by, y0: b.y0 + by, x1: b.x1 - by, y1: b.y1 - by };
}

export function inBounds(b: TileBounds, x: number, y: number): boolean {
  return x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
}

export function boundsWidth(b: TileBounds): number {
  return b.x1 - b.x0 + 1;
}

export function boundsHeight(b: TileBounds): number {
  return b.y1 - b.y0 + 1;
}

/** A random tile inside the rect, `margin` tiles away from its edges */
export function randomTileIn(b: TileBounds, rng: () => number, margin = 0): { x: number; y: number } {
  const inner = insetBounds(b, margin);
  const x0 = Math.min(inner.x0, inner.x1);
  const y0 = Math.min(inner.y0, inner.y1);
  return {
    x: x0 + Math.floor(rng() * (Math.abs(inner.x1 - inner.x0) + 1)),
    y: y0 + Math.floor(rng() * (Math.abs(inner.y1 - inner.y0) + 1)),
  };
}

/** Is the tile on the rect's outer ring, `thickness` tiles deep */
export function onRing(b: TileBounds, x: number, y: number, thickness: number): boolean {
  if (!inBounds(b, x, y)) return false;
  return x < b.x0 + thickness || x > b.x1 - thickness || y < b.y0 + thickness || y > b.y1 - thickness;
}

/** A random tile `inset` tiles inside one of the rect's four sides (0 top, 1 bottom, 2 left, 3 right) */
export function randomEdgeTile(b: TileBounds, side: number, rng: () => number, inset = 1): { x: number; y: number } {
  const x = b.x0 + Math.floor(rng() * boundsWidth(b));
  const y = b.y0 + Math.floor(rng() * boundsHeight(b));
  switch (side) {
    case 0: return { x, y: b.y0 + inset };
    case 1: return { x, y: b.y1 - inset };
    case 2: return { x: b.x0 + inset, y };
    default: return { x: b.x1 - inset, y };
  }
}

/** The area a grid's run plays on: its `bounds` (Phase 1's zone) or, without them, the whole grid */
export function areaOf(grid: { width: number; height: number; bounds?: TileBounds }): TileBounds {
  return grid.bounds ?? fullBounds(grid.width, grid.height);
}
