// World-space art for the underground fungus farm: the crop on each farm tile
// (spores → sprouts → caps → mature glowing mushrooms → ripe), its sway and
// breathing glow, spores drifting off mature caps, the growth pop, the ripe
// sparkle, the harvest pluck, growth bars and the mushroom an ant carries.
//
// Every crop frame is BAKED once into an offscreen sheet (stage × layout ×
// sway × mirror); per frame a tile costs one drawImage plus a few 2 px rects,
// animated only by frame choice, offsets and stepped alpha. 1 art px = 2 px.

import { PAL } from '../../engine/renderer/pixelart/palette';
import { PixelPainter } from '../../engine/renderer/pixelart/PixelPainter';
import { TILE_SIZE } from '../../shared/constants';
import {
  FARM_STAGE_COUNT,
  FarmAnimState,
  FarmStage,
  farmGrowthProgress,
  farmGrowthStage,
  farmTileVariant,
  mulchScrapCount,
  type FarmTileVariant,
} from './fungusGrowth';

type Ctx = CanvasRenderingContext2D;

const ART = 2; // screen px per art px
const T = TILE_SIZE;
const SWAYS = [-1, 0, 1] as const;
const SHAPES = 3;

const CAP = PAL.fungus.cap;
const STALK = PAL.fungus.stalk;
const GLOW = PAL.fungus.glow;
const LEAF = PAL.leaf;

/** Where the chewed-leaf scraps of the mulch lie on a bed (art px, front-most last) */
const MULCH_SPOTS: ReadonlyArray<[number, number]> = [[3, 13], [10, 14], [6, 10], [13, 11], [2, 9], [9, 7]];

/**
 * Mushroom anchors (stem base, art px) per layout: `big` grow full caps,
 * `small` stay short. Kept inside the 16×16 cell with room for a 1 px sway.
 */
const LAYOUTS: ReadonlyArray<{ big: ReadonlyArray<[number, number]>; small: ReadonlyArray<[number, number]> }> = [
  { big: [[5, 12], [11, 10]], small: [[8, 14], [3, 7], [12, 14]] },
  { big: [[9, 11]], small: [[3, 8], [12, 14], [5, 14]] },
  { big: [[5, 13], [11, 11]], small: [[8, 7], [12, 5], [3, 6]] },
];

/** Back to front: lower stems (closer to the viewer) draw last */
const BY_DEPTH = (a: readonly [number, number], b: readonly [number, number]) => a[1] - b[1];

/** A big mushroom: outlined 8 px dome, lit top-left, dark gills with glowing pores, 2 px stem */
function paintBigShroom(p: PixelPainter, bx: number, by: number, s: number, ripe: boolean): void {
  const O = CAP[0];
  // Stem (does not sway): lit left column, shaded right, outlined
  p.vline(bx - 2, by - 3, 4, O);
  p.vline(bx + 1, by - 3, 4, O);
  p.vline(bx - 1, by - 3, 4, STALK[3]);
  p.vline(bx, by - 3, 4, STALK[2]);
  p.hline(bx - 1, by, 2, STALK[1]);
  // Cap (sways with s)
  const cx = bx + s;
  p.hline(cx - 2, by - 8, 4, O);
  p.px(cx - 3, by - 7, O);
  p.px(cx + 2, by - 7, O);
  p.hline(cx - 2, by - 7, 4, CAP[4]);
  if (ripe) p.px(cx - 1, by - 7, GLOW[2]); // ripe glint
  p.px(cx - 4, by - 6, O);
  p.px(cx + 3, by - 6, O);
  p.hline(cx - 3, by - 6, 6, CAP[3]);
  p.px(cx - 2, by - 6, CAP[4]);
  p.px(cx + 2, by - 6, CAP[2]);
  p.px(cx - 4, by - 5, O);
  p.px(cx + 3, by - 5, O);
  p.hline(cx - 3, by - 5, 6, CAP[2]);
  p.px(cx - 3, by - 5, CAP[3]);
  p.px(cx + 2, by - 5, CAP[1]);
  // Gills: dark slats under the rim with three pore lights
  p.hline(cx - 4, by - 4, 8, O);
  p.px(cx - 2, by - 4, GLOW[1]);
  p.px(cx, by - 4, GLOW[2]);
  p.px(cx + 2, by - 4, GLOW[1]);
}

/** An opening cap on a short stem (outlined, 5 px wide) */
function paintSmallCap(p: PixelPainter, bx: number, by: number, s: number): void {
  const O = CAP[0];
  p.vline(bx, by - 1, 2, STALK[3]);
  const cx = bx + s;
  p.hline(cx - 1, by - 4, 3, O);
  p.px(cx - 2, by - 3, O);
  p.px(cx + 2, by - 3, O);
  p.hline(cx - 1, by - 3, 3, CAP[3]);
  p.px(cx - 1, by - 3, CAP[4]);
  p.hline(cx - 2, by - 2, 5, O);
  p.px(cx, by - 2, GLOW[1]);
}

/** A sprout: pale stalk with a nub of cap color on top */
function paintSprout(p: PixelPainter, bx: number, by: number, s: number): void {
  p.vline(bx, by - 2, 3, STALK[3]);
  p.px(bx + 1, by, STALK[1]);
  p.hline(bx - 1 + s, by - 3, 2, CAP[4]);
  p.px(bx + 1 + s, by - 3, CAP[2]);
  p.hline(bx - 1 + s, by - 4, 3, CAP[0]);
}

/** Mycelium threads and spore dots spreading from an anchor */
function paintMycelium(p: PixelPainter, bx: number, by: number, k: number): void {
  p.hline(bx - 2, by, 4, STALK[2]);
  p.px(bx + 2, by - 1, STALK[2]);
  p.px(bx - 3, by + (k % 2 === 0 ? 1 : -1), STALK[1]);
  p.px(bx, by - 1, k % 2 === 0 ? GLOW[0] : CAP[3]);
}

/**
 * One crop cell in art px (0..15) for a stage, layout and sway step.
 * Pure painter calls, so it can be checked without a canvas.
 */
export function paintFarmCrop(p: PixelPainter, stage: FarmStage, shape: number, sway: number): void {
  const layout = LAYOUTS[shape % SHAPES];
  const all = [...layout.big, ...layout.small].sort(BY_DEPTH);
  if (stage === FarmStage.Spores) {
    all.forEach(([x, y], k) => paintMycelium(p, x, y, k));
    return;
  }
  if (stage === FarmStage.Sprouts) {
    all.forEach(([x, y]) => paintSprout(p, x, y, sway));
    return;
  }
  if (stage === FarmStage.Caps) {
    for (const [x, y] of layout.small) paintSprout(p, x, y, sway);
    for (const [x, y] of [...layout.big].sort(BY_DEPTH)) paintSmallCap(p, x, y, sway);
    return;
  }
  const ripe = stage === FarmStage.Ready;
  for (const [x, y] of layout.small) paintSmallCap(p, x, y, sway);
  for (const [x, y] of [...layout.big].sort(BY_DEPTH)) paintBigShroom(p, x, y, sway, ripe);
}

/** The pale fungus glow behind mature caps (drawn first, at a stepped alpha, to breathe) */
export function paintFarmGlow(p: PixelPainter, shape: number): void {
  const layout = LAYOUTS[shape % SHAPES];
  for (const [cx, by] of layout.big) {
    // A dithered halo one pixel outside the cap outline
    for (let x = -2; x <= 1; x++) p.px(cx + x, by - 9, (x & 1) === 0 ? GLOW[1] : GLOW[2]);
    for (const side of [cx - 5, cx + 4]) {
      p.px(side, by - 7, GLOW[1]);
      p.px(side, by - 6, GLOW[2]);
      p.px(side, by - 5, GLOW[1]);
    }
    p.px(cx - 4, by - 8, GLOW[0]);
    p.px(cx + 3, by - 8, GLOW[0]);
    // Light the pores cast on the stem and the bed
    p.px(cx - 3, by - 3, GLOW[1]);
    p.px(cx + 2, by - 3, GLOW[1]);
    for (let x = -3; x <= 2; x += 2) p.px(cx + x, by + 1, GLOW[0]);
  }
}

/** The pale violet mushroom an ant carries (7×5 art px, outlined) */
export function paintCarriedMushroom(p: PixelPainter): void {
  const O = CAP[0];
  p.hline(2, 0, 3, O);
  p.px(1, 1, O);
  p.px(5, 1, O);
  p.hline(2, 1, 3, CAP[4]);
  p.px(0, 2, O);
  p.px(6, 2, O);
  p.hline(1, 2, 5, CAP[3]);
  p.px(2, 2, CAP[4]);
  p.hline(0, 3, 7, O);
  p.px(3, 3, GLOW[2]);
  p.px(2, 4, O);
  p.px(3, 4, STALK[3]);
  p.px(4, 4, O);
}

/** The green leaf an ant carries to the farm (6×4 art px, outlined, with a midrib) */
export function paintCarriedLeaf(p: PixelPainter): void {
  const O = LEAF[0];
  p.hline(2, 0, 3, O);
  p.px(1, 1, O);
  p.hline(2, 1, 3, LEAF[2]);
  p.px(5, 1, O);
  p.px(0, 2, O);
  p.hline(1, 2, 4, LEAF[1]);
  p.px(2, 2, LEAF[0]); // midrib
  p.px(3, 2, LEAF[0]);
  p.px(5, 2, O);
  p.hline(1, 3, 4, O);
}

/** Sheet column of a crop cell */
function cellCol(shape: number, swayIdx: number, flip: boolean): number {
  return (shape * SWAYS.length + swayIdx) * 2 + (flip ? 1 : 0);
}

/** Stepped breathing alpha for the glow (no smooth fades) */
const GLOW_ALPHA = [0.25, 0.4, 0.55] as const;

export class FungusFarmArt {
  readonly anim = new FarmAnimState();
  private sheet: OffscreenCanvas | null = null;
  private glow: OffscreenCanvas | null = null;
  private carried: OffscreenCanvas | null = null;
  private carriedLeaf: OffscreenCanvas | null = null;

  /** Bake every crop frame once (first draw) */
  private bake(): void {
    const cols = SHAPES * SWAYS.length * 2;
    const sheet = new OffscreenCanvas(cols * T, FARM_STAGE_COUNT * T);
    const ctx = sheet.getContext('2d')!;
    for (let stage = 0; stage < FARM_STAGE_COUNT; stage++) {
      for (let shape = 0; shape < SHAPES; shape++) {
        for (let si = 0; si < SWAYS.length; si++) {
          const ox = cellCol(shape, si, false) * T;
          paintFarmCrop(new PixelPainter(ctx, ART, ox, stage * T), stage as FarmStage, shape, SWAYS[si]);
          // Mirrored copy right next to it
          const mx = cellCol(shape, si, true) * T;
          ctx.save();
          ctx.translate(mx + T, stage * T);
          ctx.scale(-1, 1);
          ctx.drawImage(sheet, ox, stage * T, T, T, 0, 0, T, T);
          ctx.restore();
        }
      }
    }
    const glow = new OffscreenCanvas(SHAPES * 2 * T, T);
    const g = glow.getContext('2d')!;
    for (let shape = 0; shape < SHAPES; shape++) {
      paintFarmGlow(new PixelPainter(g, ART, shape * 2 * T, 0), shape);
      g.save();
      g.translate((shape * 2 + 1) * T + T, 0);
      g.scale(-1, 1);
      g.drawImage(glow, shape * 2 * T, 0, T, T, 0, 0, T, T);
      g.restore();
    }
    const carried = new OffscreenCanvas(7 * ART, 5 * ART);
    paintCarriedMushroom(new PixelPainter(carried.getContext('2d')!, ART));
    const leaf = new OffscreenCanvas(6 * ART, 4 * ART);
    paintCarriedLeaf(new PixelPainter(leaf.getContext('2d')!, ART));
    this.sheet = sheet;
    this.glow = glow;
    this.carried = carried;
    this.carriedLeaf = leaf;
  }

  /**
   * The crop on one farm tile (tile pass, under walls' shading). `time` in
   * seconds. Records the stage for the growth pop.
   */
  drawCrop(ctx: Ctx, tx: number, ty: number, amount: number, capacity: number, time: number, producing: boolean): void {
    if (!this.sheet) this.bake();
    const stage = farmGrowthStage(amount, capacity);
    this.anim.observe(tx, ty, stage, time);
    const v = farmTileVariant(tx, ty);
    const swayIdx = stage === FarmStage.Spores ? 1 : swayStep(time, v);
    const pop = this.anim.popAmount(tx, ty, time);
    const lift = pop > 0.5 ? ART : 0; // growth pop: one art px up, then settle
    const px = tx * T + v.dx * ART;
    const py = ty * T + v.dy * ART - lift;

    if (stage >= FarmStage.Mature) {
      const phase = Math.sin(time * (producing ? 2.2 : 1.4) + v.phase * 6.283);
      ctx.globalAlpha = GLOW_ALPHA[phase > 0.4 ? 2 : phase > -0.4 ? 1 : 0];
      ctx.drawImage(this.glow!, (v.shape * 2 + (v.flip ? 1 : 0)) * T, 0, T, T, px + (swayIdx - 1) * ART, py, T, T);
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(this.sheet!, cellCol(v.shape, swayIdx, v.flip) * T, stage * T, T, T, px, py, T, T);

    if (pop > 0) {
      // Pop sparks: four pale pixels pushed out from the crop's middle
      const r = Math.round((1 - pop) * 5 + 3) * ART;
      const cx = tx * T + T / 2;
      const cy = ty * T + T / 2 - ART;
      ctx.fillStyle = GLOW[2];
      ctx.fillRect(cx - r, cy, ART, ART);
      ctx.fillRect(cx + r - ART, cy, ART, ART);
      ctx.fillRect(cx, cy - r, ART, ART);
      ctx.fillRect(cx, cy + r - ART, ART, ART);
    }
  }

  /**
   * The chewed-leaf mulch gardeners laid on a bed (tile pass, under the crop):
   * green scraps that thin out as the fungus eats them.
   */
  drawMulch(ctx: Ctx, tx: number, ty: number, mulch: number, capacity: number): void {
    const n = mulchScrapCount(mulch, capacity);
    if (n === 0) return;
    const v = farmTileVariant(tx, ty);
    for (let i = 0; i < n; i++) {
      const [ax, ay] = MULCH_SPOTS[i];
      const x = tx * T + (v.flip ? 15 - ax - 1 : ax) * ART;
      const y = ty * T + ay * ART;
      ctx.fillStyle = LEAF[0];
      ctx.fillRect(x - ART, y, 4 * ART, ART);
      ctx.fillStyle = (i + v.shape) % 2 === 0 ? LEAF[1] : LEAF[2];
      ctx.fillRect(x, y - ART, 2 * ART, ART);
    }
  }

  /** "Cultivando": leaf crumbs falling from a gardener's jaws onto the bed as she lays the mulch */
  drawTendCrumbs(ctx: Ctx, px: number, py: number, time: number): void {
    for (let k = 0; k < 3; k++) {
      const u = (time * 1.8 + k / 3) % 1;
      const x = Math.round((px + (k - 1) * 5) / ART) * ART;
      const y = Math.round((py - 6 + u * 12) / ART) * ART;
      ctx.globalAlpha = u < 0.7 ? 1 : 0.5;
      ctx.fillStyle = k === 1 ? LEAF[2] : LEAF[1];
      ctx.fillRect(x, y, ART, ART);
    }
    ctx.globalAlpha = 1;
  }

  /** The leaf riding on a gardener's back (centered above the ant at px, py) */
  drawCarriedLeaf(ctx: Ctx, px: number, py: number): void {
    if (!this.carriedLeaf) this.bake();
    ctx.drawImage(this.carriedLeaf!, Math.round(px / ART) * ART - 3 * ART, Math.round(py / ART) * ART - 7 * ART);
  }

  /**
   * Everything that floats over the farm (after the tile pass, under ants):
   * spores off mature caps, ripe sparkles and growth bars.
   */
  drawOverlay(
    ctx: Ctx,
    tiles: ReadonlyArray<{ x: number; y: number; amount: number }>,
    capacity: number,
    time: number,
    showBars: boolean,
  ): void {
    for (const t of tiles) {
      const stage = farmGrowthStage(t.amount, capacity);
      const v = farmTileVariant(t.x, t.y);
      const bx = t.x * T + v.dx * ART;
      const by = t.y * T + v.dy * ART;
      if (stage >= FarmStage.Mature) drawSpores(ctx, bx, by, time, v);
      if (stage === FarmStage.Ready) drawSparkle(ctx, bx, by, time, v);
      if (showBars) drawGrowthBar(ctx, t.x, t.y, farmGrowthProgress(t.amount, capacity), stage === FarmStage.Ready);
    }
  }

  /** Harvest plucks: drawn after the ants so the crumbs fly over the harvester */
  drawPlucks(ctx: Ctx, time: number): void {
    for (const fx of this.anim.harvests(time)) drawPluck(ctx, fx.x, fx.y, fx.t);
  }

  /** The mushroom riding on an ant's back (centered above the ant at px, py) */
  drawCarriedMushroom(ctx: Ctx, px: number, py: number): void {
    if (!this.carried) this.bake();
    ctx.drawImage(this.carried!, Math.round(px / ART) * ART - 3 * ART, Math.round(py / ART) * ART - 8 * ART);
  }

  /** From the simulation: a farm tile just lost mushrooms (stamped on the render clock, wall seconds) */
  queueHarvest(x: number, y: number): void {
    this.anim.noteHarvest(x, y, Date.now() / 1000);
  }
}

/** Sway frame: lean left, upright or right, stepping with a per-tile phase */
function swayStep(time: number, v: FarmTileVariant): number {
  const s = Math.sin(time * 1.3 + v.phase * 6.283);
  return s > 0.55 ? 2 : s < -0.55 ? 0 : 1;
}

/** Two spores per mature tile drifting up and fading in two alpha steps */
function drawSpores(ctx: Ctx, bx: number, by: number, time: number, v: FarmTileVariant): void {
  ctx.fillStyle = GLOW[2];
  for (let k = 0; k < 2; k++) {
    const u = (time / 2.6 + v.phase + k * 0.5) % 1;
    const sx = bx + (k === 0 ? 10 : 22) + Math.round(Math.sin(time * 2 + k + v.phase * 6) * 1.5) * ART;
    const sy = by + 10 - Math.round(u * 14) * ART;
    ctx.globalAlpha = u < 0.6 ? 0.6 : 0.3;
    ctx.fillRect(Math.round(sx / ART) * ART, sy, ART, ART);
  }
  ctx.globalAlpha = 1;
}

/** Ripe sparkle: a 5 px plus-star blinking between three spots on the tile */
function drawSparkle(ctx: Ctx, bx: number, by: number, time: number, v: FarmTileVariant): void {
  const cycle = time * 1.5 + v.phase * 3;
  if (cycle % 1 > 0.55) return;
  const spot = Math.floor(cycle) % 3;
  const sx = bx + [8, 20, 14][spot];
  const sy = by + [6, 4, 2][spot];
  ctx.fillStyle = CAP[4];
  ctx.fillRect(sx - 2 * ART, sy, ART, ART);
  ctx.fillRect(sx + 2 * ART, sy, ART, ART);
  ctx.fillRect(sx, sy - 2 * ART, ART, ART);
  ctx.fillRect(sx, sy + 2 * ART, ART, ART);
  ctx.fillStyle = PAL.white;
  ctx.fillRect(sx - ART, sy, 3 * ART, ART);
  ctx.fillRect(sx, sy - ART, ART, 3 * ART);
}

/** Growth bar under the crop: an outlined 10 art px gauge, full and bright when ripe */
function drawGrowthBar(ctx: Ctx, tx: number, ty: number, progress: number, ripe: boolean): void {
  const x = tx * T + 2 * ART;
  const y = ty * T + 13 * ART;
  const lit = ripe ? 10 : Math.floor(progress * 10);
  ctx.fillStyle = CAP[0];
  ctx.fillRect(x, y, 12 * ART, 3 * ART);
  ctx.fillStyle = STALK[1];
  ctx.fillRect(x + ART, y + ART, 10 * ART, ART);
  if (lit > 0) {
    ctx.fillStyle = ripe ? GLOW[2] : GLOW[1];
    ctx.fillRect(x + ART, y + ART, lit * ART, ART);
  }
}

/** Crumb launch directions (art px per pluck) and their colors */
const CRUMBS: ReadonlyArray<{ vx: number; vy: number; color: string }> = [
  { vx: -5, vy: -6, color: CAP[4] },
  { vx: 4, vy: -7, color: GLOW[2] },
  { vx: -2, vy: -9, color: STALK[3] },
  { vx: 6, vy: -4, color: CAP[4] },
  { vx: -6, vy: -3, color: GLOW[1] },
  { vx: 2, vy: -8, color: GLOW[2] },
];

/** Harvest pluck: a flash, then the cap lifts and shrinks out of the bed while crumbs fly and fall */
function drawPluck(ctx: Ctx, tx: number, ty: number, t: number): void {
  const cx = tx * T + T / 2;
  const cy = ty * T + T / 2;
  if (t < 0.15) {
    // Snap flash: a pale plus where the stem broke
    ctx.fillStyle = GLOW[2];
    ctx.fillRect(cx - 3 * ART, cy, 7 * ART, ART);
    ctx.fillRect(cx, cy - 3 * ART, ART, 7 * ART);
  }
  // The plucked cap: three shrinking outlined sizes, rising one art px per step
  const half = t < 0.33 ? 3 : t < 0.66 ? 2 : 1;
  const lift = Math.round(t * 8) * ART;
  const top = cy - lift - 2 * ART;
  ctx.fillStyle = CAP[0];
  ctx.fillRect(cx - (half + 1) * ART, top - ART, (half * 2 + 2) * ART, 4 * ART);
  ctx.fillStyle = CAP[4];
  ctx.fillRect(cx - half * ART, top, half * 2 * ART, ART);
  ctx.fillStyle = CAP[2];
  ctx.fillRect(cx - half * ART, top + ART, half * 2 * ART, ART);
  ctx.fillStyle = STALK[3];
  ctx.fillRect(cx, top + 2 * ART, ART, 2 * ART);
  // Crumbs: ballistic arcs with gravity, snapped to the art grid
  ctx.globalAlpha = t < 0.7 ? 1 : 0.5;
  for (const c of CRUMBS) {
    const x = cx + Math.round(c.vx * t * 2.5) * ART;
    const y = cy + Math.round(c.vy * t * 2.5 + 14 * t * t) * ART;
    ctx.fillStyle = c.color;
    ctx.fillRect(x, y, ART, ART);
  }
  ctx.globalAlpha = 1;
}
