// Prop sprite recipes on the one art-pixel scale: food items (24×24, turned
// to 16 directions like units) and the static dens and giant mushroom (drawn
// with PixelPainter at ART_PX on doubled grids, light baked top-left since
// they never rotate).
import { ArtGrid } from '../pixelart/ArtGrid';
import { ArtPen } from '../pixelart/ArtPen';
import { directionAngle } from '../pixelart/directions';
import { PAL, hash2 } from '../pixelart/palette';
import type { PixelPainter } from '../pixelart/PixelPainter';
import { SPRITE_GRID } from './spriteScale';

/** Food variants in the atlas: 0 leaf frond, 1 leaf pods, 2 mushroom, 3 beetle meat, 4 cricket meat. */
export const FOOD_VARIANTS = 5;
export const FOOD_SIZE_LEVELS = 5;

export interface FoodSpriteSpec {
  variant: number;
  sizeLevel: number;
  direction: number;
}

/**
 * Food recipes are authored on a 16×16 frame around (8, 8); the atlas grid is
 * bigger (SPRITE_GRID.food), so they are re-rasterized FOOD_ART_SCALE times
 * larger around its pivot. Primitives are scaled, never finished pixels: the
 * sprite is still one art pixel = ART_PX world px, just with more of them.
 */
const FOOD_AUTHOR_CENTER = 8;
export const FOOD_ART_SCALE = SPRITE_GRID.food / 16;

/** The subset of ArtPen the food recipes use. */
interface FoodPen {
  px(x: number, y: number, color: string): void;
  line(x0: number, y0: number, x1: number, y1: number, color: string): void;
  rect(x: number, y: number, w: number, h: number, color: string): void;
  ellipse(cx: number, cy: number, rx: number, ry: number, color: string): void;
  capsule(x0: number, y0: number, x1: number, y1: number, r: number, color: string): void;
  outlined(draw: (pen: FoodPen) => void, outline: string): void;
  shade(ramps: ReadonlyArray<readonly string[]>): void;
}

/** An ArtPen seen through the 16-px authoring frame, scaled up around the grid's pivot. */
class ScaledFoodPen implements FoodPen {
  private readonly pen: ArtPen;
  private readonly k: number;
  private readonly center: number;

  constructor(pen: ArtPen, k: number, center: number) {
    this.pen = pen;
    this.k = k;
    this.center = center;
  }

  private at(v: number): number {
    return this.center + (v - FOOD_AUTHOR_CENTER) * this.k;
  }

  px(x: number, y: number, color: string): void {
    // One authoring pixel becomes a k×k block around its scaled centre
    const half = this.k / 2;
    const cx = this.at(Math.round(x) + 0.5);
    const cy = this.at(Math.round(y) + 0.5);
    this.pen.rect(cx - half, cy - half, this.k, this.k, color);
  }

  line(x0: number, y0: number, x1: number, y1: number, color: string): void {
    this.pen.line(this.at(x0), this.at(y0), this.at(x1), this.at(y1), color);
  }

  rect(x: number, y: number, w: number, h: number, color: string): void {
    this.pen.rect(this.at(x), this.at(y), w * this.k, h * this.k, color);
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, color: string): void {
    this.pen.ellipse(this.at(cx), this.at(cy), rx * this.k, ry * this.k, color);
  }

  capsule(x0: number, y0: number, x1: number, y1: number, r: number, color: string): void {
    this.pen.capsule(this.at(x0), this.at(y0), this.at(x1), this.at(y1), r * this.k, color);
  }

  outlined(draw: (pen: FoodPen) => void, outline: string): void {
    this.pen.outlined(() => draw(this), outline);
  }

  shade(ramps: ReadonlyArray<readonly string[]>): void {
    this.pen.shade(ramps);
  }
}

/** Food item on the SPRITE_GRID.food art-pixel grid, in one of the 16 directions, lit top-left after the turn. */
export function paintFood({ variant, sizeLevel, direction }: FoodSpriteSpec): ArtGrid {
  const grid = new ArtGrid(SPRITE_GRID.food);
  const sl = Math.min(FOOD_SIZE_LEVELS - 1, Math.max(0, sizeLevel));
  const p = new ScaledFoodPen(new ArtPen(grid, directionAngle(direction)), FOOD_ART_SCALE, Math.floor(SPRITE_GRID.food / 2));
  if (variant === 1) paintPods(p, sl);
  else if (variant === 2) paintMushroomFood(p, sl);
  else if (variant === 3) paintBeetleMeat(p, sl);
  else if (variant === 4) paintCricketMeat(p, sl);
  else paintFrond(p, sl);
  return grid;
}

/** Alien frond: three tapering lobes fanning from one root, with glowing beads at the tips. */
function paintFrond(p: FoodPen, sl: number): void {
  const L = PAL.leaf;
  const reach = [2.6, 3.2, 3.6, 4, 4.4][sl];
  const spread = [1.4, 1.8, 2.2, 2.6, 3][sl];
  const r = [0.6, 0.7, 0.8, 0.9, 1][sl];
  const bx = 8 - Math.round(reach / 2);
  const tips: Array<[number, number]> = [[bx + reach + 0.6, 8], [bx + reach - 0.6, 8 - spread], [bx + reach - 0.6, 8 + spread]];
  p.outlined(pen => {
    for (const [tx, ty] of tips) pen.capsule(bx, 8, tx, ty, r, L[1]);
  }, PAL.outline);
  if (sl >= 3) for (const [tx, ty] of tips) p.line(bx + 1, 8 + Math.sign(ty - 8), tx - 1, ty, L[0]); // dark midribs
  p.shade([L]);
  for (const [tx, ty] of tips) p.px(Math.round(tx), Math.round(ty), L[2]);
}

/** Alien pod cluster: plump seed pods, each outlined on its own, on a short stalk; every pod has a glowing tip. */
function paintPods(p: FoodPen, sl: number): void {
  const L = PAL.leaf;
  const d = [0, 1.5, 1.8, 2.2, 2.5][sl];
  const pr = [1.3, 1.1, 1.3, 1.2, 1.4][sl];
  // Back to front: the lower pods overlap the ones behind them
  const pods: Array<[number, number]> = sl === 0 ? [[9, 8]]
    : sl <= 2 ? [[9, 8 - d], [9, 8 + d]]
      : [[8, 8 - d], [10.5, 8], [8, 8 + d]];
  p.outlined(pen => pen.line(5, 8, 7, 8, L[0]), PAL.outline);
  for (const [x, y] of pods) p.outlined(pen => pen.ellipse(x, y, pr * 1.3, pr, L[1]), PAL.outline);
  p.shade([L]);
  for (const [x, y] of pods) p.px(Math.round(x + pr), Math.round(y), L[2]);
}

/** Small alien fungus: blue-violet cap with mint glowing pores on a mauve stalk. */
function paintMushroomFood(p: FoodPen, sl: number): void {
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

/** A cracked half of olive beetle shell cupping bulging amber ichor pulp with bubbled cells. */
function paintBeetleMeat(p: FoodPen, sl: number): void {
  const F = PAL.alienFlesh;
  const B = PAL.beetle;
  const rx = [1.8, 2.4, 3.0, 3.6, 4.2][sl];
  const ry = rx * 0.8;
  p.outlined(pen => {
    if (sl >= 1) pen.ellipse(9, 9, rx * 0.8, ry * 0.8, B[1]); // shell half
    pen.ellipse(8, 8, rx * (sl >= 1 ? 0.8 : 1), ry * (sl >= 1 ? 0.8 : 1), F[2]); // pulp bulging out
    pen.px(8 - Math.round(rx * 0.8), 7, F[2]); // irregular lump
  }, PAL.outline);
  if (sl >= 2) p.line(8, Math.round(8 + ry * 0.8), Math.round(8 + rx * 0.8), 8, B[2]); // the shell's cracked rim
  if (sl >= 3) p.line(7, 8, 9, 7, F[1]); // ichor vein
  p.shade([F, B]);
  p.px(7, 7, F[4]); // bubbled cells
  if (sl >= 3) p.px(9, 6, F[3]);
  if (sl >= 4) p.px(6, 9, F[3]);
}

/** A torn straw cricket leg with its amber ichor flesh bulging from the broken end. */
function paintCricketMeat(p: FoodPen, sl: number): void {
  const F = PAL.alienFlesh;
  const C = PAL.cricket;
  const len = [2, 3, 3.5, 4, 4.5][sl];
  const r = [1, 1, 1.2, 1.4, 1.6][sl];
  const fr = [1.3, 1.5, 1.8, 2.1, 2.4][sl];
  const x0 = 8 - len * 0.6;
  const x1 = 8 + len * 0.3;
  p.outlined(pen => {
    pen.capsule(x0, 9, x1, 8, r, C[1]); // femur club
    pen.ellipse(x1 + fr * 0.6, 8, fr, fr * 0.85, F[2]); // torn flesh end
  }, PAL.outline);
  if (sl >= 2) p.line(x0, 9 - r * 0.5, x1 - 1, 8 - r * 0.5, C[2]); // femur ridge
  p.shade([C, F]);
  if (sl >= 1) p.px(Math.round(x1 + fr * 0.6), 8, F[4]); // glistening ichor
  if (sl >= 3) p.px(Math.round(x1 + fr), 9, F[1]);
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

/** Whether art pixel (x, y) is inside PixelPainter.ellipse(cx, cy, rx, ry). */
function inEllipse(x: number, y: number, cx: number, cy: number, rx: number, ry: number): boolean {
  const nx = (x - cx) / (rx + 0.25);
  const ny = (y - cy) / (ry + 0.25);
  return nx * nx + ny * ny <= 1;
}

/** Checkerboard dither clipped to a silhouette, so lighting never paints over its outline. */
function ditherInside(
  p: PixelPainter, x: number, y: number, w: number, h: number, a: string, b: string,
  inside: (x: number, y: number) => boolean,
): void {
  for (let iy = 0; iy < h; iy++) {
    for (let ix = 0; ix < w; ix++) {
      if (inside(x + ix, y + iy)) p.px(x + ix, y + iy, (ix + iy) % 2 === 0 ? a : b);
    }
  }
}

/** 40×40 art-pixel den: the beetle's burrow mound, or the cricket's resonant hollow. */
export function paintDen(p: PixelPainter, cricket: boolean): void {
  if (cricket) paintResonantHollow(p);
  else paintBurrowMound(p);
}

/**
 * Beetle den (the acorazados' guarida): an alien burrow mound, a lumpy
 * regolith heap shingled with overlapping bony ash plates around a burrow
 * mouth ringed by pale fangs, a small cluster of amber eyes in the dark,
 * and angular outcrop chips around its foot.
 */
function paintBurrowMound(p: PixelPainter): void {
  const S = PAL.soil;
  const R = PAL.stone;
  const H = PAL.beetleAsh;
  const inMound = (x: number, y: number): boolean =>
    inEllipse(x, y, 20, 20, 13, 10) || inEllipse(x, y, 9, 24, 6, 5) || inEllipse(x, y, 31, 23, 6, 5);
  p.shadow(20, 28, 16, 6, PAL.outline);

  // Lumpy mound: a main dome shouldered by two side lobes, lit top-left
  outlined((dx, dy, c) => {
    p.ellipse(20 + dx, 20 + dy, 13, 10, c ?? S[1]);
    p.ellipse(9 + dx, 24 + dy, 6, 5, c ?? S[1]);
    p.ellipse(31 + dx, 23 + dy, 6, 5, c ?? S[1]);
  });
  ditherInside(p, 9, 11, 13, 7, S[2], S[1], inMound);
  ditherInside(p, 12, 10, 7, 3, S[3], S[2], inMound);
  ditherInside(p, 4, 20, 6, 3, S[2], S[1], inMound);
  ditherInside(p, 21, 26, 17, 6, S[0], S[1], inMound);
  p.line(8, 23, 12, 20, PAL.outcropVein); // faint outcrop veins through the crust
  p.line(27, 14, 30, 18, PAL.outcropVein);

  // Overlapping bony plates shingled around the mouth, back row first so the
  // front plates lap over it: a pale lit crown, a dark lapped lower edge
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i < 5 ? i - 2 : i - 7) * 0.62 + (i < 5 ? 0 : Math.PI);
    const x = Math.round(20 + Math.cos(a) * 10.5);
    const y = Math.round(20 + Math.sin(a) * 7.2);
    p.ellipse(x, y, 2.4, 1.6, H[1]);
    p.hline(x - 1, y - 1, 3, H[2]);
    p.hline(x - 2, y + 1, 5, H[0]);
  }

  // Burrow mouth: a raised lip ringed by pale fangs, the throat and a small
  // cluster of amber eyes in the dark
  p.ellipse(20, 19, 7.6, 5.2, S[2]);
  ditherInside(p, 12, 13, 17, 2, S[3], S[2], (x, y) => inEllipse(x, y, 20, 19, 7.6, 5.2));
  p.ellipse(20, 19, 6, 4, S[0]);
  p.ellipse(20, 20, 5, 3, PAL.earth[0]);
  p.ellipse(20, 21, 3, 1.8, PAL.black);
  for (const x of [16, 18, 20, 22, 24]) p.px(x, 16, H[2]);
  for (const x of [17, 20, 23]) p.px(x, 23, H[2]);
  p.px(18, 21, PAL.beetleEye);
  p.px(19, 20, PAL.beetleEye);
  p.px(21, 20, PAL.beetleEye);
  p.px(22, 21, PAL.beetleEye);

  // Angular outcrop chips and pale mineral flecks around the foot
  for (let i = 0; i < 7; i++) {
    const a = 0.3 + (i / 7) * Math.PI + (hash2(i, 17) - 0.5) * 0.5; // front half, jittered
    const x = Math.round(20 + Math.cos(a) * 15);
    const y = Math.round(23 + Math.sin(a) * 9);
    p.rect(x, y - 1, 2, 2, R[1]);
    p.px(x, y - 1, R[2]);
    p.px(x, y - 2, R[3]);
  }
  for (const [x, y] of [[15, 15], [26, 22], [11, 21], [22, 26]] as const) p.px(x, y, PAL.mineralFleck);
}

/**
 * Cricket den: a resonant hollow, a wide terraced bowl sunk into the regolith
 * with resonance ripples etched around it, hollow ash pipes standing on its
 * rim, and a cricket's antennae poking out of the dark throat.
 */
function paintResonantHollow(p: PixelPainter): void {
  const S = PAL.soil;
  const D = PAL.dust;
  const E = PAL.earth;
  const C = PAL.cricket;
  const inRim = (x: number, y: number): boolean => inEllipse(x, y, 20, 21, 15, 9.5);
  p.shadow(20, 28, 16, 6, PAL.outline);

  // Resonance ripples etched in the regolith around the hollow
  for (const [rx, ry, n] of [[18.5, 11.2, 44], [17, 10.4, 40]] as const) {
    for (let i = 0; i < n; i++) {
      if (i % 4 === 3) continue;
      const a = (i / n) * Math.PI * 2;
      p.px(Math.round(20 + Math.cos(a) * rx), Math.round(21 + Math.sin(a) * ry), rx > 18 ? S[2] : S[3]);
    }
  }

  // Low rim, lit on its top-left shoulder
  outlined((dx, dy, c) => p.ellipse(20 + dx, 21 + dy, 15, 9.5, c ?? S[2]));
  ditherInside(p, 6, 12, 14, 5, S[3], S[2], inRim);
  ditherInside(p, 24, 27, 12, 5, S[1], S[2], inRim);

  // Terraced bowl stepping down to a dark throat; inner walls facing the light are lit
  const terraces: Array<[number, number, number, string, string]> = [
    [21, 12.5, 7.4, S[1], S[3]],
    [22, 9.5, 5.4, S[0], S[2]],
    [22, 6, 3.4, E[1], S[1]],
  ];
  for (const [cy, rx, ry, fill, lip] of terraces) {
    p.ellipse(20, cy, rx, ry, fill);
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * (Math.PI / 2) + 0.15; // bottom-right arc
      p.px(Math.round(20 + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry), lip);
    }
  }
  p.ellipse(20, 23, 3.4, 2, E[0]);
  p.ellipse(20, 23, 1.8, 1, PAL.black);

  // A cricket's long antennae swept out of the throat
  p.line(19, 22, 17, 18, C[0]);
  p.line(17, 18, 13, 15, C[1]);
  p.line(21, 22, 24, 18, C[0]);
  p.line(24, 18, 28, 16, C[1]);

  // Hollow ash pipes standing on the rim, open at the top
  const pipes: Array<[number, number, number]> = [[7, 18, 5], [11, 14, 7], [17, 12, 4], [26, 12, 6], [31, 15, 7], [34, 21, 4]];
  for (const [x, y, h] of pipes) {
    outlined((dx, dy, c) => p.rect(x + dx, y - h + dy, 2, h + 1, c ?? D[1]));
    p.vline(x, y - h + 1, h, D[2]);
    p.hline(x, y - h, 2, E[0]);
    p.px(x + 2, y + 1, S[0]);
  }
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
