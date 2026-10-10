import type { PixelPainter } from '../../engine/renderer/pixelart/PixelPainter';

/**
 * Pixel art that shows bought upgrades in the world: the queen's crown and
 * the upgraded incubation floor. Hard pixels, flat colors and 2-state blinks,
 * like the rest of the colony's art.
 */

const GOLD = ['#5a3a10', '#b07a1c', '#f0b541', '#ffe27a'] as const;
const GEM = { red: '#ff3b3b', vein: '#c6ff3d', white: '#ffffff' } as const;

/**
 * The queen's crown above her vein crest, one step per tier: 1 a small gold
 * circlet, 2 taller points with a vein-green gem, 3 a full crown with red
 * side gems and a blinking spark. (cx, bottom) is the crown's base center in
 * art pixels; the crown grows upward from it.
 */
export function drawQueenCrown(p: PixelPainter, cx: number, bottom: number, tier: number, blink: boolean): void {
  if (tier <= 0) return;
  const half = tier >= 3 ? 5 : 4;
  const left = cx - half;
  const width = half * 2;
  // Band
  p.rect(left, bottom - 2, width, 2, GOLD[2]);
  p.hline(left, bottom - 2, width, GOLD[3]);
  p.hline(left, bottom, width, GOLD[0]);
  // Points: outer two and the center one, taller per tier
  const tall = tier >= 2 ? 3 : 2;
  p.rect(left, bottom - 2 - tall + 1, 2, tall - 1, GOLD[2]);
  p.rect(left + width - 2, bottom - 2 - tall + 1, 2, tall - 1, GOLD[2]);
  p.rect(cx - 1, bottom - 2 - tall, 2, tall, GOLD[2]);
  p.px(cx - 1, bottom - 2 - tall, GOLD[3]);
  if (tier >= 3) {
    // Two more points between, and red side gems on the band
    p.rect(left + 2, bottom - 3, 1, 1, GOLD[1]);
    p.rect(left + width - 3, bottom - 3, 1, 1, GOLD[1]);
    p.px(left + 1, bottom - 1, GEM.red);
    p.px(left + width - 2, bottom - 1, GEM.red);
  }
  if (tier >= 2) {
    // Center gem in the Swarm's vein green
    p.rect(cx - 1, bottom - 1, 2, 1, GEM.vein);
  }
  if (tier >= 3 && blink) {
    // A spark on the tallest point
    p.px(cx, bottom - 3 - tall, GEM.white);
    p.px(cx - 2, bottom - 2 - tall, GEM.white);
  }
}

const WARM = ['#4a2a12', '#8a4a1c', '#e08a3a', '#ffcf7a'] as const;

/**
 * Upgraded incubation floor, drawn over the incubation texture at tile
 * (px, py) of size `size` canvas pixels; `unit` is one art pixel. Each level
 * adds a detail: 1 warm corner studs, 2 silk threads along the edges, 3 a
 * glowing ember at the heart (2-state blink), 4 a warm rim around the tile.
 */
export function drawIncubationTier(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  unit: number,
  level: number,
  blink: boolean,
): void {
  if (level <= 0) return;
  const u = unit;
  const fill = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(px + x * u, py + y * u, w * u, h * u);
  };
  const n = Math.floor(size / u); // art pixels per tile side
  // 1: four warm studs in the corners
  for (const [x, y] of [[1, 1], [n - 2, 1], [1, n - 2], [n - 2, n - 2]]) fill(x, y, 1, 1, WARM[2]);
  if (level >= 2) {
    // 2: pale silk threads, dotted along the top and bottom edges
    for (let x = 3; x < n - 3; x += 2) {
      fill(x, 0, 1, 1, '#e8dcc8');
      fill(x, n - 1, 1, 1, '#e8dcc8');
    }
  }
  if (level >= 3) {
    // 3: an ember at the heart of the tile, blinking between two steps
    const c = Math.floor(n / 2) - 1;
    fill(c, c, 2, 2, blink ? WARM[3] : WARM[2]);
    fill(c - 1, c, 1, 2, WARM[1]);
    fill(c + 2, c, 1, 2, WARM[1]);
  }
  if (level >= 4) {
    // 4: a warm rim, the chamber kept hot
    fill(0, 1, 1, n - 2, WARM[1]);
    fill(n - 1, 1, 1, n - 2, WARM[1]);
  }
}
