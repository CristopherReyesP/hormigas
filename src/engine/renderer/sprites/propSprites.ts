// Prop sprite recipes on the one art-pixel scale: food items (16×16, turned
// to 16 directions like units) and the static dens and giant mushroom (drawn
// with PixelPainter at ART_PX on doubled grids, light baked top-left since
// they never rotate).
import { ArtGrid } from '../pixelart/ArtGrid';
import { ArtPen } from '../pixelart/ArtPen';
import { directionAngle } from '../pixelart/directions';
import { PAL, hash2 } from '../pixelart/palette';
import type { PixelPainter } from '../pixelart/PixelPainter';
import { SPRITE_GRID } from './spriteScale';

/** Food variants in the atlas: 0-1 leaves (1 is turned a quarter), 2 mushroom, 3 beetle meat, 4 cricket meat. */
export const FOOD_VARIANTS = 5;
export const FOOD_SIZE_LEVELS = 5;

export interface FoodSpriteSpec {
  variant: number;
  sizeLevel: number;
  direction: number;
}

const SHROOM_CAP_RAMP = [PAL.shroomCap, PAL.shroomCapLight] as const;
const SHROOM_STEM_RAMP = [PAL.sand[1], PAL.shroomStem] as const;

/** 16×16 art-pixel food item in one of the 16 directions, lit top-left after the turn. */
export function paintFood({ variant, sizeLevel, direction }: FoodSpriteSpec): ArtGrid {
  const grid = new ArtGrid(SPRITE_GRID.food);
  const sl = Math.min(FOOD_SIZE_LEVELS - 1, Math.max(0, sizeLevel));
  const p = new ArtPen(grid, directionAngle(direction + (variant === 1 ? 4 : 0)));
  if (variant === 2) paintMushroomFood(p, sl);
  else if (variant === 3) paintMeat(p, sl, PAL.meat, false);
  else if (variant === 4) paintMeat(p, sl, PAL.cricket, true);
  else paintLeaf(p, sl);
  return grid;
}

/** Pointed alien frond with a 1-px midrib and side veins. */
function paintLeaf(p: ArtPen, sl: number): void {
  const L = PAL.leaf;
  const rx = [1.6, 2.2, 2.8, 3.4, 4.0][sl];
  const ry = [1.4, 1.7, 2.0, 2.4, 2.7][sl];
  const tip = [3, 3, 4, 5, 5][sl];
  p.outlined(pen => {
    pen.ellipse(8, 8, rx, ry, L[1]);
    pen.line(8 - tip, 8, 8 + tip, 8, L[1]);
  }, PAL.outline);
  p.hline(8 - tip + 1, 8, tip * 2 - 1, L[0]);
  if (sl >= 2) {
    for (const vx of sl >= 3 ? [6, 9] : [8]) {
      p.px(vx + 1, 7, L[0]);
      p.px(vx + 1, 9, L[0]);
    }
  }
  p.shade([L]);
  p.sheen(8, 8, 1, L[2]);
}

/** Small panther-cap mushroom: muted rust cap, white spots, cream stem. */
function paintMushroomFood(p: ArtPen, sl: number): void {
  const rx = [1.8, 2.4, 3.0, 3.7, 4.4][sl];
  const ry = [1.3, 1.6, 1.9, 2.3, 2.8][sl];
  const stemH = [3, 3, 4, 5, 6][sl];
  p.outlined(pen => {
    pen.rect(7, 8, 3, stemH, PAL.shroomStem);
    pen.ellipse(8, 7, rx, ry, PAL.shroomCap);
  }, PAL.outline);
  const spots: Array<[number, number]> = [[8, 6]];
  if (sl >= 2) spots.push([6, 7]);
  if (sl >= 3) spots.push([10, 6]);
  if (sl >= 4) spots.push([5, 8], [11, 8]);
  for (const [x, y] of spots) p.px(x, y, PAL.white);
  p.shade([SHROOM_CAP_RAMP, SHROOM_STEM_RAMP]);
}

/** Chunky irregular meat blob with fat marbling; ramp = [dark, base, highlight]. */
function paintMeat(p: ArtPen, sl: number, ramp: readonly string[], fleck: boolean): void {
  const rx = [1.8, 2.4, 3.0, 3.6, 4.2][sl];
  const ry = rx * 0.8;
  p.outlined(pen => {
    pen.ellipse(8, 8, rx, ry, ramp[1]);
    pen.ellipse(9, 9, rx * 0.55, ry * 0.55, ramp[1]);
    pen.px(8 - Math.round(rx), 7, ramp[1]); // irregular lump
  }, PAL.outline);
  if (sl >= 2) p.line(7, 7, 9, 8, ramp[2]); // fat marbling
  if (sl >= 3) p.line(8, 10, 10, 9, ramp[0]);
  if (fleck) p.px(9, 8, PAL.meat[2]); // raw-flesh fleck on cricket meat
  p.shade([ramp]);
}

// ─── Static props (PixelPainter at ART_PX, light baked top-left) ───

/** Stamp the shape 8 times offset by 1 art px in the outline color, then fill: an exact 1-px outline. */
function outlined(draw: (dx: number, dy: number, color: string | null) => void, outline: string = PAL.outline): void {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx !== 0 || dy !== 0) draw(dx, dy, outline);
    }
  }
  draw(0, 0, null);
}

/**
 * 40×40 art-pixel dirt mound den: radial branching cracks, a dark hole with
 * a rim, pebbles. The cricket variant adds grass tufts and mossy dither.
 */
export function paintDen(p: PixelPainter, grassy: boolean): void {
  const S = PAL.soil;
  p.shadow(20, 27, 16, 6, PAL.outline);

  outlined((dx, dy, c) => p.ellipse(20 + dx, 20 + dy, 15, 11, c ?? S[1]));
  p.dither(10, 12, 10, 6, S[2], S[1]);
  p.dither(12, 11, 6, 2, S[3], S[2]);
  p.dither(22, 26, 10, 4, S[0], S[1]);
  if (grassy) {
    p.dither(12, 10, 8, 4, PAL.grass[1], S[1], 1);
    p.dither(24, 22, 6, 4, PAL.grass[0], S[1]);
  }

  // Radial cracks with a short branch each
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const mx = 20 + Math.cos(a) * 9.4;
    const my = 20 + Math.sin(a) * 7;
    p.line(20 + Math.cos(a) * 6.4, 20 + Math.sin(a) * 4.8, 20 + Math.cos(a) * 12.4, 20 + Math.sin(a) * 9.2, S[0]);
    p.line(mx, my, mx + Math.cos(a + 0.7) * 2.5, my + Math.sin(a + 0.7) * 2, S[0]);
  }

  // Entrance hole with a dark rim and a lit far lip
  p.ellipse(20, 20, 6.8, 4.8, S[0]);
  p.hline(16, 15, 9, S[2]);
  p.ellipse(20, 20, 5.2, 3.4, PAL.earth[0]);
  p.ellipse(20, 20, 2.8, 1.8, PAL.black);

  // Pebbles around the mound
  for (let i = 0; i < 9; i++) {
    const a = hash2(i, grassy ? 31 : 17) * Math.PI * 2;
    const x = Math.round(20 + Math.cos(a) * 13);
    const y = Math.round(20 + Math.sin(a) * 9.6);
    p.rect(x, y, 2, 2, i % 2 === 0 ? PAL.stone[1] : PAL.stone[0]);
    p.px(x, y, i % 2 === 0 ? PAL.stone[3] : PAL.stone[2]);
  }

  // Grass tufts (cricket den only)
  if (grassy) {
    const blades: Array<[number, number]> = [[8, 8], [30, 8], [4, 18], [34, 16], [16, 4], [24, 6]];
    for (const [bx, by] of blades) {
      p.vline(bx, by, 4, PAL.grass[2]);
      p.px(bx, by - 1, PAL.grass[3]);
      p.vline(bx + 1, by + 1, 3, PAL.grass[1]);
    }
  }
}

/**
 * 32×32 art-pixel panther-cap Amanita: muted rust cap with a lit shoulder and
 * white warts, cream stem with a lit left edge and dithered right shading.
 */
export function paintGiantMushroom(p: PixelPainter): void {
  p.shadow(16, 28, 12, 2.8, PAL.outline);

  // Stem
  outlined((dx, dy, c) => p.rect(12 + dx, 14 + dy, 8, 14, c ?? PAL.shroomStem));
  p.dither(16, 18, 4, 10, PAL.sand[1], PAL.shroomStem);
  p.vline(12, 16, 10, PAL.white);

  // Cap
  outlined((dx, dy, c) => p.ellipse(16 + dx, 10 + dy, 12, 6.8, c ?? PAL.shroomCap));
  p.dither(8, 6, 8, 4, PAL.shroomCapLight, PAL.shroomCap);
  p.dither(10, 5, 4, 2, PAL.white, PAL.shroomCapLight);
  p.hline(9, 16, 15, PAL.shroomCapLight); // underside rim
  // White warts, bigger near the crown
  const warts: Array<[number, number, number]> = [
    [11, 5, 1.2], [16, 8, 1.4], [21, 6, 1.2], [6, 10, 1], [25, 12, 1], [12, 12, 0.6], [20, 11, 0.6], [24, 8, 0.6],
  ];
  for (const [x, y, r] of warts) p.disc(x, y, r, PAL.white);
}
