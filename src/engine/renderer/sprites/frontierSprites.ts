// Phase 2's creatures beyond the thorn wall, authored facing right like the
// other wildlife (ArtPen turns them and adds the top-left light):
// - the legionary, a crimson army ant with sickle mandibles (24×24);
// - the Legionary Queen, the same build swollen, crested in gold (44×44);
// - the weaver spider, eight bent legs and a red hourglass (32×32);
// - the stalker mantis, a long blighted-green hunter with folded scythes (40×40).
// Static props (PixelPainter, never turned): the Legionary nest and the spider lair.
import { ArtGrid } from '../pixelart/ArtGrid';
import { ArtPen } from '../pixelart/ArtPen';
import { directionAngle } from '../pixelart/directions';
import { PAL } from '../pixelart/palette';
import type { PixelPainter } from '../pixelart/PixelPainter';
import { SPRITE_GRID } from './spriteScale';
import type { WildlifeSpriteSpec } from './wildlifeSprites';

const GAIT = [1, 0, -1, 0];

/** The army-ant body at `k` times the legionary's size (the Queen is the same ant, bigger) */
function paintArmyAnt(grid: ArtGrid, frame: number, direction: number, k: number, queen: boolean, shadow: boolean): ArtGrid {
  const p = new ArtPen(grid, directionAngle(direction));
  const L = PAL.legion;
  const O = PAL.outline;
  const A = Math.floor(grid.width / 2);
  const c = (v: number) => Math.round(A + (v - 12) * k);
  const swing = GAIT[frame % GAIT.length] * Math.max(1, Math.round(k));
  const mirror = (y: number): number => 2 * A - y;

  // Six legs, tripod gait, elbowed out wide: army ants run
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 3; i++) {
      const s = (i + (side === 1 ? 1 : 0)) % 2 === 0 ? swing : -swing;
      const hipX = c(11 + i);
      const footX = hipX + Math.round((i - 1) * 4 * k) + s;
      const kneeX = Math.round(hipX + (footX - hipX) * 0.4);
      p.polyline([[hipX, A + side], [kneeX, A + side * Math.round(5 * k)], [footX, A + side * Math.round(8 * k)]], L[2]);
      if (k > 1.4) p.polyline([[hipX - 1, A + side], [kneeX - 1, A + side * Math.round(5 * k)], [footX - 1, A + side * Math.round(8 * k)]], L[2]);
    }
  }

  const gasterRx = (queen ? 5.6 : 3.6) * k;
  const gasterRy = (queen ? 4.4 : 2.8) * k;
  p.outlined(pen => {
    pen.ellipse(c(queen ? 6 : 7), A, gasterRx, gasterRy, L[1]);
    pen.px(c(10), A, L[1]);
    pen.ellipse(c(12.5), A, 2.4 * k, 1.8 * k, L[2]);
    pen.px(c(15), A, L[1]);
    pen.disc(c(17.5), A, 2.8 * k, L[2]); // the big soldier head
  }, O);
  p.ellipse(c(queen ? 6 : 7), A, gasterRx - 1, gasterRy - 1, L[2]);
  // Gaster bands
  for (const dx of [-2, 0, 2]) p.vline(c((queen ? 6 : 7) + dx), A - Math.round(gasterRy - 1.5), Math.round((gasterRy - 1.5) * 2) + 1, L[1]);

  // Sickle mandibles: pale hooks curving in from the head
  for (const side of [-1, 1]) {
    const y0 = A + side * Math.round(1.5 * k);
    p.line(c(20), y0, c(22.5), A + side * Math.round(2.4 * k), PAL.legionBone);
    p.px(c(23), A + side * Math.round(1.2 * k), PAL.legionBone);
  }
  // Tiny pale eyes (army ants are near blind)
  p.px(c(18), A - Math.round(1.5 * k), L[3]);
  p.px(c(18), mirror(A - Math.round(1.5 * k)), L[3]);

  if (queen) {
    // A gold crest of spikes over the head, and gold seams on the gaster
    for (const dy of [-2, 0, 2]) p.line(c(16.5), A + dy, c(15), A + dy * 2, PAL.legionCrown);
    p.px(c(17.5), A, PAL.legionCrown);
    p.hline(c(3), A, Math.round(6 * k), PAL.legionCrown);
  }

  p.shade([L]);
  p.sheen(c(17.5), A, 1, L[3]);
  if (shadow) p.castShadow(O, 1, 2);
  return grid;
}

export function paintLegionary({ frame, direction, shadow = true }: WildlifeSpriteSpec): ArtGrid {
  return paintArmyAnt(new ArtGrid(SPRITE_GRID.legionary), frame, direction, 1, false, shadow);
}

export function paintLegionQueen({ frame, direction, shadow = true }: WildlifeSpriteSpec): ArtGrid {
  return paintArmyAnt(new ArtGrid(SPRITE_GRID.legionQueen), frame, direction, 1.75, true, shadow);
}

/** 32×32 weaver spider: a round abdomen with a red hourglass, eight bent legs, a cluster of red eyes */
export function paintSpider({ frame, direction, shadow = true }: WildlifeSpriteSpec): ArtGrid {
  const grid = new ArtGrid(SPRITE_GRID.spider);
  const p = new ArtPen(grid, directionAngle(direction));
  const S = PAL.spider;
  const O = PAL.outline;
  const A = Math.floor(SPRITE_GRID.spider / 2);
  const swing = GAIT[frame % GAIT.length];

  // Eight legs: four a side, a high knee and a long shin, alternating pairs step
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 4; i++) {
      const s = (i + (side === 1 ? 1 : 0)) % 2 === 0 ? swing : -swing;
      const hipX = 17 + i;
      const kneeX = 13 + i * 4 + s;
      const footX = 9 + i * 6 + s * 2;
      // Two strands thick, the lit tone: the legs must read on dark regolith
      p.polyline([[hipX, A + side * 2], [kneeX, A + side * 8], [footX, A + side * 13]], S[3]);
      p.polyline([[hipX + 1, A + side * 2], [kneeX + 1, A + side * 8], [footX + 1, A + side * 13]], S[2]);
      p.px(kneeX, A + side * 8, S[3]);
    }
  }
  p.outlined(pen => {
    pen.ellipse(10, A, 7, 6, S[1]);
    pen.disc(19, A, 4, S[2]);
  }, O);
  p.ellipse(10, A, 6, 5, S[2]);
  // The hourglass mark
  p.line(8, A - 2, 12, A + 2, PAL.spiderMark);
  p.line(8, A + 2, 12, A - 2, PAL.spiderMark);
  p.hline(8, A - 2, 5, PAL.spiderMark);
  p.hline(8, A + 2, 5, PAL.spiderMark);
  // Fangs and eyes
  p.px(23, A - 1, S[3]);
  p.px(23, A + 1, S[3]);
  for (const [x, y] of [[20, -2], [21, -1], [21, 1], [20, 2], [22, 0]] as const) p.px(x, A + y, PAL.spiderMark);

  p.shade([S]);
  p.sheen(10, A, 3, S[3]);
  if (shadow) p.castShadow(O, 1, 2);
  return grid;
}

/** 40×40 stalker mantis: long abdomen, thin thorax, folded scythe arms, a triangular head with pale eyes */
export function paintMantis({ frame, direction, shadow = true }: WildlifeSpriteSpec): ArtGrid {
  const grid = new ArtGrid(SPRITE_GRID.mantis);
  const p = new ArtPen(grid, directionAngle(direction));
  const M = PAL.mantis;
  const O = PAL.outline;
  const A = Math.floor(SPRITE_GRID.mantis / 2);
  const swing = GAIT[frame % GAIT.length];
  const strike = frame % 4 === 1 ? 1 : 0;

  // Four walking legs from the back of the thorax: long and spindly
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 2; i++) {
      const s = (i + (side === 1 ? 1 : 0)) % 2 === 0 ? swing : -swing;
      const hipX = 17 + i * 3;
      const footX = 10 + i * 12 + s * 2;
      p.polyline([[hipX, A + side], [hipX - 2 + i * 4, A + side * 7], [footX, A + side * 11]], M[3]);
    }
  }
  p.outlined(pen => {
    pen.capsule(4, A, 16, A, 3, M[1]); // the long abdomen
    pen.capsule(16, A, 27, A, 1.4, M[2]); // the thin prothorax
    pen.poly([[28, A - 4], [33, A], [28, A + 4]], M[2]); // the triangular head
    // Scythes: folded forward along the body, the tips raised on the strike frame
    for (const side of [-1, 1]) {
      pen.capsule(24, A + side * 2, 31 + strike, A + side * 6, 1.3, M[2]);
      pen.capsule(31 + strike, A + side * 6, 36 + strike, A + side * 3, 1, M[3]);
    }
  }, O);
  p.capsule(5, A, 15, A, 2, M[2]);
  for (const x of [7, 10, 13]) p.vline(x, A - 2, 5, M[1]);
  // Scythe spines
  for (const side of [-1, 1]) {
    p.px(29 + strike, A + side * 4, PAL.mantisEye);
    p.px(33 + strike, A + side * 5, PAL.mantisEye);
  }
  p.px(29, A - 3, PAL.mantisEye);
  p.px(29, A + 3, PAL.mantisEye);

  p.shade([M]);
  if (shadow) p.castShadow(O, 1, 2);
  return grid;
}

/** The Legionary nest (40×40 art px): a crimson mound riddled with holes, bones of prey around it */
export function paintLegionNest(p: PixelPainter): void {
  const L = PAL.legion;
  p.shadow(20, 29, 17, 6, PAL.outline);
  p.ellipse(20, 21, 15, 11, PAL.outline);
  p.ellipse(20, 21, 14, 10, L[1]);
  p.ellipse(18, 18, 10, 6, L[2]);
  p.ellipse(16, 15, 5, 3, L[3]);
  // Entrance holes: many small dark mouths
  for (const [x, y] of [[20, 20], [12, 23], [27, 23], [16, 27], [24, 28], [9, 18], [31, 17], [20, 13]] as const) {
    p.ellipse(x, y, 2, 1.4, PAL.black);
    p.px(x - 1, y - 1, L[0]);
  }
  // Scattered prey bones
  for (const [x, y] of [[4, 30], [35, 31], [6, 12], [36, 9]] as const) {
    p.hline(x - 1, y, 3, PAL.legionBone);
    p.px(x - 2, y - 1, PAL.legionBone);
    p.px(x + 2, y + 1, PAL.legionBone);
  }
  p.px(16, 14, PAL.legionCrown);
}

/** The spider lair (40×40 art px): a dark hole under a radiating web */
export function paintSpiderLair(p: PixelPainter): void {
  p.shadow(20, 26, 15, 6, PAL.outline);
  p.ellipse(20, 22, 9, 6, PAL.outline);
  p.ellipse(20, 22, 7, 4.5, PAL.black);
  // Web: spokes from the hole, and two rings of silk across them
  const spokes = 8;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    p.line(20, 20, Math.round(20 + Math.cos(a) * 18), Math.round(20 + Math.sin(a) * 16), PAL.web);
  }
  for (const r of [7, 12, 16]) {
    for (let i = 0; i < spokes; i++) {
      const a0 = (i / spokes) * Math.PI * 2;
      const a1 = ((i + 1) / spokes) * Math.PI * 2;
      p.line(
        Math.round(20 + Math.cos(a0) * r), Math.round(20 + Math.sin(a0) * r * 0.9),
        Math.round(20 + Math.cos(a1) * r), Math.round(20 + Math.sin(a1) * r * 0.9),
        r === 16 ? PAL.spider[3] : PAL.web,
      );
    }
  }
  p.px(19, 21, PAL.spiderMark);
  p.px(21, 21, PAL.spiderMark);
}
