import { PAL } from '../../engine/renderer/pixelart/palette';
import { PixelPainter } from '../../engine/renderer/pixelart/PixelPainter';

/**
 * Pixel art for the Crystal Hive's arrival in the intro: the spires that
 * grow out of the crater and the drones that rise out of it. The Hive are
 * not insects: no legs, antennae, mandibles or segmented body. A drone is a
 * floating cut gem around a glowing cyan energy core, set in gold filigree,
 * with two shards that orbit it. Faceted cyan shell lit up-left, dark navy
 * outline. Drones never rotate, so the light always comes from the top-left.
 */

/** Spires use the crater's art pixel: 1 art px = 2 world px. */
const SPIRE_PX = 2;
/** Drones too (art direction: bigger units get bigger grids, never a bigger scale). */
const DRONE_PX = 2;
const DRONE_GRID = 18;
export const DRONE_FRAME_SIZE = DRONE_GRID * DRONE_PX;

const SH = PAL.crystal.shell;
const GOLD = PAL.crystal.gold;
const OUT = PAL.crystal.outline;

export interface SpireArt {
  body: OffscreenCanvas;
  /** Tip and lit edge only, replayed additively for the night glow */
  glint: OffscreenCanvas;
  /** Width in art px */
  width: number;
  /** World px from the canvas's left edge to the spire's center line */
  baseX: number;
  /** World px of ground seat drawn below the base line */
  baseBelow: number;
}

/** Rows of ground seat drawn below the base line. */
const SPIRE_SEAT = 2;

/**
 * One faceted crystal column on `p`, growing up from (`cx`, `baseRow`):
 * `width` (odd) wide, `height` tall, leaning `slope` px per row and tapering
 * to a point. `outline` paints the navy rim one px wider; otherwise the
 * facets: lit left edge, lit facet, mid ridge, shaded facet, dark right edge,
 * plus one diagonal facet break. Tip and upper lit edge also go on `glint`.
 */
function paintColumn(
  p: PixelPainter,
  glint: PixelPainter | null,
  cx: number,
  baseRow: number,
  width: number,
  height: number,
  slope: number,
  outline: boolean,
): void {
  const half = (width - 1) / 2;
  const taper = Math.min(height - 1, Math.ceil(width * 1.8));
  for (let k = 0; k < height; k++) {
    const x = cx + Math.round(k * slope);
    const y = baseRow - k;
    const hw = k < height - taper ? half : Math.round(((height - 1 - k) / taper) * half);
    if (outline) {
      p.hline(x - hw - 1, y, hw * 2 + 3, OUT);
      if (k === height - 1) p.px(x, y - 1, OUT);
      continue;
    }
    for (let dx = -hw; dx <= hw; dx++) {
      let c: string;
      if (dx === -hw && hw > 0) c = k > height * 0.3 ? SH[4] : SH[3];
      else if (dx < 0) c = SH[3];
      else if (dx === 0) c = hw === 0 ? SH[4] : SH[2];
      else c = dx === hw && hw > 1 ? SH[0] : SH[1];
      p.px(x + dx, y, c);
    }
    // One facet break: a bright diagonal across the lit facet
    const d = k - Math.floor(height * 0.42);
    if (hw > 1 && d >= 0 && d < hw) p.px(x - hw + 1 + d, y, SH[4]);
    if (glint && hw > 0 && k > height * 0.6) glint.px(x - hw, y, SH[3]);
    if (glint && k >= height - 2) glint.px(x, y, SH[4]);
  }
}

/**
 * A crystal spire cluster: a tall main column of `width` (odd) by `height`
 * art px leaning a little toward `lean`, with one or two short side crystals
 * splayed out from its foot, seated in dark ground flecked with gold ore.
 */
export function buildSpire(width: number, height: number, lean: 1 | -1): SpireArt {
  const W = width * 3 + 10;
  const H = height + 2 + SPIRE_SEAT;
  const body = new OffscreenCanvas(W * SPIRE_PX, H * SPIRE_PX);
  const glintCanvas = new OffscreenCanvas(W * SPIRE_PX, H * SPIRE_PX);
  const p = new PixelPainter(body.getContext('2d')!, SPIRE_PX);
  const g = new PixelPainter(glintCanvas.getContext('2d')!, SPIRE_PX);
  const cx = Math.floor(W / 2);
  const baseRow = H - 1 - SPIRE_SEAT;
  const half = (width - 1) / 2;

  // Seat: dark dithered ground, rubble and a few gold ore flecks
  p.shadow(cx, baseRow + 1, half + 4, 1, PAL.crater[0]);
  p.px(cx - half - 3, baseRow + 1, PAL.stone[2]);
  p.px(cx + half + 3, baseRow, PAL.stone[1]);
  p.px(cx - half - 1, baseRow + 1, GOLD[1]);
  p.px(cx + half + 1, baseRow + 2, GOLD[2]);

  const sides: Array<[number, number, number, number]> = [
    // x offset, width, height, slope
    [-(half + 1) * lean, Math.max(3, width - 2), Math.round(height * 0.45), -0.42 * lean],
  ];
  if (width >= 7) sides.push([(half + 1) * lean, 3, Math.round(height * 0.3), 0.5 * lean]);
  for (const outline of [true, false]) {
    for (const [ox, w, h, slope] of sides) paintColumn(p, outline ? null : g, cx + ox, baseRow, w, h, slope, outline);
  }
  for (const outline of [true, false]) paintColumn(p, outline ? null : g, cx, baseRow, width, height, 0.07 * lean, outline);

  return { body, glint: glintCanvas, width, baseX: cx * SPIRE_PX + SPIRE_PX / 2, baseBelow: (SPIRE_SEAT + 1) * SPIRE_PX };
}

/** Grid column of the drone's vertical axis, and the rows of its gold girdle and its energy core. */
const AXIS_X = 9;
const GIRDLE = 7;
const CORE_ROW = 10;

/** World px from a drone frame's top-left corner to its core's art pixel. */
export const DRONE_CORE_OFFSET = { x: AXIS_X * DRONE_PX, y: CORE_ROW * DRONE_PX } as const;

/**
 * Half-width per row from the top tip (row 1) to the bottom tip (row 16): a
 * tall, narrow octahedron, its short crown over a long pavilion, like a gem
 * floating point down. The gold girdle runs flush around its widest rows.
 */
const BODY_HW = [0, 1, 1, 2, 2, 3, 4, 4, 3, 3, 3, 2, 2, 1, 1, 0] as const;
const BODY_TOP = 1;

/** Each row of the body as [y, half-width]. */
const bodyRows = (): Array<[number, number]> => BODY_HW.map((hw, k) => [BODY_TOP + k, hw]);

/**
 * Shell facets, lit from the top-left: the crown's upper-left face is the
 * brightest and its ridge catches the light; the pavilion below sits in
 * mid tones, darkest on the lower-right.
 */
function shellColor(dx: number, y: number, hw: number): string {
  if (y < GIRDLE) {
    if (dx === 0) return SH[4];
    if (dx < 0) return dx === -hw ? SH[4] : SH[3];
    return dx === hw && hw > 1 ? SH[1] : SH[2];
  }
  if (dx < 0) return dx === -hw ? SH[3] : SH[2];
  if (dx === 0) return SH[2];
  return dx === hw && hw > 1 ? SH[0] : SH[1];
}

/** The gold girdle: bright on the lit left, dull on the shaded right. */
function girdleColor(dx: number): string {
  return dx <= -2 ? GOLD[2] : dx <= 1 ? GOLD[1] : GOLD[0];
}

/** The energy core per frame: a dark seed while dormant, then waking, lit, and throbbing bright. */
const CORE_LOOKS: ReadonlyArray<{ r: number; rim: string; heart: string }> = [
  { r: 1, rim: SH[0], heart: SH[1] },
  { r: 1, rim: SH[2], heart: SH[3] },
  { r: 1, rim: PAL.crystal.shield, heart: SH[4] },
  { r: 2, rim: PAL.crystal.shield, heart: SH[4] },
];

/** One drone frame: the gem, its gold filigree and the core in state `frame`. */
function paintDrone(p: PixelPainter, frame: number): void {
  // Navy outline one px wider than the shape on every side
  for (const [y, hw] of bodyRows()) {
    for (const oy of [-1, 0, 1]) p.hline(AXIS_X - hw - 1, y + oy, hw * 2 + 3, OUT);
  }
  for (const [y, hw] of bodyRows()) {
    for (let dx = -hw; dx <= hw; dx++) {
      p.px(AXIS_X + dx, y, y === GIRDLE ? girdleColor(dx) : shellColor(dx, y, hw));
    }
  }
  // Gold filigree: a cap on the top tip and a drop on the bottom one
  p.px(AXIS_X, BODY_TOP, GOLD[2]);
  p.px(AXIS_X, BODY_TOP + BODY_HW.length - 1, GOLD[1]);

  const { r, rim, heart } = CORE_LOOKS[frame];
  for (let dy = -r; dy <= r; dy++) {
    const hw = r - Math.abs(dy);
    for (let dx = -hw; dx <= hw; dx++) {
      p.px(AXIS_X + dx, CORE_ROW + dy, Math.abs(dx) + Math.abs(dy) < r ? heart : rim);
    }
  }
}

/** Frames by core state (0 dormant, 1 waking, 2 lit, 3 bright), upright and never rotated. */
export function buildDroneFrames(): OffscreenCanvas[] {
  return CORE_LOOKS.map((_, frame) => {
    const c = new OffscreenCanvas(DRONE_FRAME_SIZE, DRONE_FRAME_SIZE);
    paintDrone(new PixelPainter(c.getContext('2d')!, DRONE_PX), frame);
    return c;
  });
}

const SHARD_GRID = 9;
const SHARD_AXIS = 4;
export const SHARD_FRAME_SIZE = SHARD_GRID * DRONE_PX;
/** World px from a shard frame's top-left corner to its center art pixel. */
export const SHARD_CENTER_OFFSET = SHARD_AXIS * DRONE_PX;

/** Shard half-widths per row, tip to tip: a long shard with a gold band, and a short one. */
const SHARD_HW: ReadonlyArray<readonly number[]> = [
  [0, 1, 1, 1, 1, 1, 0],
  [0, 1, 1, 1, 0],
];

export interface ShardArt {
  /** On the near half of the orbit, in full light */
  near: OffscreenCanvas;
  /** On the far half, behind the drone: one ramp step darker */
  far: OffscreenCanvas;
}

const darker = (c: string): string => {
  const s = (SH as readonly string[]).indexOf(c);
  if (s >= 0) return SH[Math.max(0, s - 1)];
  const g = (GOLD as readonly string[]).indexOf(c);
  return g >= 0 ? GOLD[Math.max(0, g - 1)] : c;
};

/** A slim faceted shard: lit upper-left, shaded right, a white-hot top tip. */
function paintShard(p: PixelPainter, hws: readonly number[], far: boolean, gold: boolean): void {
  const top = SHARD_AXIS - (hws.length - 1) / 2;
  const tone = far ? darker : (c: string) => c;
  hws.forEach((hw, k) => {
    for (const oy of [-1, 0, 1]) p.hline(SHARD_AXIS - hw - 1, top + k + oy, hw * 2 + 3, OUT);
  });
  hws.forEach((hw, k) => {
    const upper = k < hws.length / 2;
    const band = gold && k === Math.floor(hws.length / 2);
    for (let dx = -hw; dx <= hw; dx++) {
      let c: string;
      if (band) c = dx < 0 ? GOLD[2] : dx === 0 ? GOLD[1] : GOLD[0];
      else if (hw === 0) c = upper ? SH[4] : SH[2];
      else if (dx < 0) c = upper ? SH[4] : SH[3];
      else if (dx === 0) c = upper ? SH[3] : SH[2];
      else c = SH[1];
      p.px(SHARD_AXIS + dx, top + k, tone(c));
    }
  });
}

/** The two orbiting shards, each as a near and a far sprite. */
export function buildShardFrames(): ShardArt[] {
  return SHARD_HW.map((hws, k) => {
    const [near, far] = [false, true].map((isFar) => {
      const c = new OffscreenCanvas(SHARD_FRAME_SIZE, SHARD_FRAME_SIZE);
      paintShard(new PixelPainter(c.getContext('2d')!, DRONE_PX), hws, isFar, k === 0);
      return c;
    });
    return { near, far };
  });
}
