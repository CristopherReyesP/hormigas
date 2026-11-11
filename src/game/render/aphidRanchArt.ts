// The aphid ranch as it is drawn in the nest: a bed of pale roots the aphids
// feed on, the aphids themselves (they shuffle a little, and huddle still when
// invaders scare them) and the honeydew they have given, one amber drop per
// share of the tile's stock. All of it on the art grid: 16 art px per tile.

import { PAL, hash2 } from '../../engine/renderer/pixelart/palette';

/** Aphids on one ranch tile */
export const APHIDS_PER_TILE = 4;
/** Honeydew drops a full tile shows */
export const MAX_DROPS = 6;

/** How many drops a tile holding `amount` of `capacity` shows: none when empty, all when full */
export function honeydewDrops(amount: number, capacity: number): number {
  if (capacity <= 0 || amount < 1) return 0;
  return Math.max(1, Math.min(MAX_DROPS, Math.round((amount / capacity) * MAX_DROPS)));
}

/** Where aphid `i` of tile (x, y) stands at `time`, in art px inside the tile; still when `scared` */
export function aphidSpot(x: number, y: number, i: number, time: number, scared: boolean): { ax: number; ay: number } {
  const seed = x * 73 + y * 151 + i * 29;
  const homeX = 2 + Math.floor(hash2(seed, 1) * 10);
  const homeY = 2 + Math.floor(hash2(seed, 2) * 9);
  if (scared) return { ax: homeX, ay: homeY };
  // One art px of shuffle, each aphid on its own slow beat
  const beat = Math.floor(time * 0.8 + hash2(seed, 3) * 4);
  return { ax: homeX + (beat % 4 === 1 ? 1 : 0), ay: homeY + (beat % 4 === 3 ? 1 : 0) };
}

/**
 * Draw one ranch tile over its floor. `px, py` is the tile's corner on screen
 * and `size` its side; `time` in seconds.
 */
export function drawAphidRanchTile(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  x: number,
  y: number,
  amount: number,
  capacity: number,
  time: number,
  scared: boolean,
): void {
  const u = size / 16;
  const dot = (ax: number, ay: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(px + ax * u, py + ay * u, w * u, h * u);
  };
  const seed = x * 73 + y * 151;

  // The bed: roots across the floor, with a few leaves of moss
  for (let k = 0; k < 3; k++) {
    const ry = 3 + k * 5 + Math.floor(hash2(seed, k + 11) * 2);
    dot(1, ry, 14, 1, PAL.grass[1]);
    dot(2 + Math.floor(hash2(seed, k + 21) * 10), ry - 1, 2, 1, PAL.grass[2]);
  }
  dot(0, 0, 16, 1, PAL.grass[0]);
  dot(0, 15, 16, 1, PAL.grass[0]);

  // Honeydew: amber drops, each with a bright glint
  const drops = honeydewDrops(amount, capacity);
  for (let k = 0; k < drops; k++) {
    const dx = 1 + Math.floor(hash2(seed, k * 5 + 31) * 13);
    const dy = 1 + Math.floor(hash2(seed, k * 5 + 32) * 13);
    dot(dx, dy, 2, 2, PAL.glowAmber);
    dot(dx, dy, 1, 1, PAL.sand[2]);
  }

  // The aphids: a plump green body, a pale back, two dark legs
  for (let i = 0; i < APHIDS_PER_TILE; i++) {
    const { ax, ay } = aphidSpot(x, y, i, time, scared);
    dot(ax, ay, 3, 2, scared ? PAL.leaf[0] : PAL.leaf[1]);
    dot(ax + 1, ay, 1, 1, PAL.leaf[2]);
    dot(ax, ay + 2, 1, 1, PAL.outline);
    dot(ax + 2, ay + 2, 1, 1, PAL.outline);
  }
}
