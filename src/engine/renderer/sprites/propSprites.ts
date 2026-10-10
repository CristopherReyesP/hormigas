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

/** Small alien fungus: blue-violet cap with mint glowing pores on a mauve stalk. */
function paintMushroomFood(p: ArtPen, sl: number): void {
  const F = PAL.fungus;
  const rx = [1.8, 2.4, 3.0, 3.7, 4.4][sl];
  const ry = [1.3, 1.6, 1.9, 2.3, 2.8][sl];
  const stemH = [3, 3, 4, 5, 6][sl];
  p.outlined(pen => {
    pen.rect(7, 8, 3, stemH, F.stalk[2]);
    pen.ellipse(8, 7, rx, ry, F.cap[2]);
  }, PAL.outline);
  const pores: Array<[number, number]> = [[8, 6]];
  if (sl >= 2) pores.push([6, 7]);
  if (sl >= 3) pores.push([10, 6]);
  if (sl >= 4) pores.push([5, 8], [11, 8]);
  for (const [x, y] of pores) p.px(x, y, F.glow[1]);
  if (sl >= 3) p.px(8, 8 + stemH - 2, F.glow[0]); // faint glowing core in the stalk
  p.shade([F.cap, F.stalk]);
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

/** Whether art pixel (x, y) is inside PixelPainter.ellipse(cx, cy, rx, ry). */
function inEllipse(x: number, y: number, cx: number, cy: number, rx: number, ry: number): boolean {
  const nx = (x - cx) / (rx + 0.25);
  const ny = (y - cy) / (ry + 0.25);
  return nx * nx + ny * ny <= 1;
}

/**
 * 32×32 art-pixel alien bioluminescent fungus: a dusky blue-violet dome with
 * rings of mint glowing pores, a glowing gill crescent under its rim and
 * drooping filaments with lit tips, on a ringed mauve stalk with a glowing
 * core that rises from a bulb sending root tendrils over the regolith.
 */
export function paintGiantMushroom(p: PixelPainter): void {
  const C = PAL.fungus.cap;
  const S = PAL.fungus.stalk;
  const G = PAL.fungus.glow;
  p.shadow(16, 28, 12, 2.8, PAL.outline);

  // Root tendrils creeping from the bulb over the ground, glowing at the tips
  const roots: Array<[number, number, number, number]> = [[12, 27, 5, 29], [20, 27, 27, 29], [14, 28, 9, 30], [18, 28, 23, 30]];
  for (const [x0, y0, x1, y1] of roots) {
    p.line(x0, y0, x1, y1, S[1]);
    p.px(x1, y1, G[0]);
  }

  // Stalk: a bulb base and a ringed column with a glowing core seen through it
  outlined((dx, dy, c) => {
    p.ellipse(16 + dx, 26 + dy, 5, 2, c ?? S[2]);
    p.rect(13 + dx, 13 + dy, 6, 13, c ?? S[2]);
  });
  p.vline(13, 14, 11, S[3]); // lit left edge
  p.dither(17, 14, 2, 11, S[1], S[2]);
  p.hline(12, 25, 3, S[3]); // lit bulb shoulder
  p.dither(17, 26, 4, 2, S[1], S[2]);
  for (const y of [17, 21]) {
    p.hline(13, y, 6, S[1]); // ring groove
    p.hline(14, y + 1, 3, S[3]); // ridge catching the light
  }
  p.vline(15, 15, 10, G[0]);
  p.px(15, 19, G[1]);
  p.px(15, 23, G[1]);

  // Cap: the gill crescent under the rim, then the dome over it
  const DOME = [16, 9, 13, 6] as const;
  const GILLS = [16, 14, 11, 3] as const;
  outlined((dx, dy, c) => {
    p.ellipse(GILLS[0] + dx, GILLS[1] + dy, GILLS[2], GILLS[3], c ?? C[0]);
    p.ellipse(DOME[0] + dx, DOME[1] + dy, DOME[2], DOME[3], c ?? C[2]);
  });
  // Glowing gill stripes wherever the crescent shows under the dome, brightest at the edge
  for (let y = 10; y <= 17; y++) {
    for (let x = 4; x <= 28; x++) {
      if (!inEllipse(x, y, ...GILLS) || inEllipse(x, y, ...DOME)) continue;
      const edge = !inEllipse(x, y + 1, ...GILLS);
      if (x % 2 === 0) p.px(x, y, edge && x % 4 === 0 ? G[1] : G[0]);
    }
  }
  // Dome light: lit crown up-left, shaded rim down-right
  p.dither(10, 4, 5, 1, C[3], C[2]);
  p.dither(7, 5, 8, 3, C[3], C[2]);
  p.dither(11, 4, 3, 2, C[4], C[3]);
  p.dither(18, 11, 9, 2, C[1], C[2]);
  p.dither(16, 13, 9, 1, C[1], C[2]);
  p.dither(15, 14, 7, 1, C[1], C[2]);

  // Bioluminescent pores in rings around the crown, bigger near the top
  const pores: Array<[number, number, boolean]> = [
    [15, 4, true], [10, 6, true], [20, 6, true],
    [6, 9, false], [13, 8, true], [18, 9, true], [25, 9, false],
    [4, 11, false], [9, 11, false], [15, 12, false], [22, 12, false], [27, 11, false],
  ];
  for (const [x, y, big] of pores) {
    if (big) {
      p.rect(x, y, 2, 2, G[1]);
      p.px(x, y, G[2]);
      p.hline(x, y + 2, 2, C[1]); // the pore's sunken lip
    } else {
      p.px(x, y, G[1]);
      p.px(x, y + 1, C[1]);
    }
  }

  // Drooping filaments from the rim, swaying out at the end, with glowing tips
  const filaments: Array<[number, number, number, number]> = [[5, 15, 5, -1], [8, 18, 4, 0], [24, 18, 4, 0], [27, 15, 5, 1]];
  for (const [x, y, len, sway] of filaments) {
    p.vline(x, y, len - 1, C[2]);
    p.px(x + sway, y + len - 1, C[2]);
    p.px(x + sway, y + len, G[1]);
  }
}
