import { PAL } from '../../engine/renderer/pixelart/palette';
import { PixelPainter } from '../../engine/renderer/pixelart/PixelPainter';

/**
 * Pixel art for the Crystal Hive's arrival in the intro: the spires that
 * grow out of the crater and the drones that unfold and crawl out. Both
 * follow the art direction for the Hive: faceted cyan shell lit up-left,
 * straight gold pincers and bands, crystal-tipped antennae, dark navy outline.
 */

/** Spires use the crater's art pixel: 1 art px = 2 world px. */
const SPIRE_PX = 2;
/** Drones use the ants' current art scale so they read at the same size class. */
const DRONE_PX = 3;
const DRONE_GRID = 20;
/** Drone frames are square so they rotate about their center. */
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

/** Upper-half point on the drone grid; painters mirror it about the body axis. */
type Px = readonly [number, number];
const AXIS = 10;

/** Paint `pts` and their mirror image across the body axis. */
function mirrored(p: PixelPainter, pts: readonly Px[], color: string): void {
  for (const [x, y] of pts) {
    p.px(x, y, color);
    p.px(x, AXIS * 2 - y, color);
  }
}

/** Row spans (x0..x1 inclusive) of a shape, keyed by distance from the axis. */
type Spans = ReadonlyArray<readonly [number, number, number]>; // [|dy|, x0, x1]

function spanRows(spans: Spans): Array<[number, number, number]> {
  const rows: Array<[number, number, number]> = [];
  for (const [d, x0, x1] of spans) {
    rows.push([AXIS - d, x0, x1]);
    if (d > 0) rows.push([AXIS + d, x0, x1]);
  }
  return rows;
}

/** Outline a shape one px wider on every side, in the Hive's navy. */
function outlineSpans(p: PixelPainter, spans: Spans): void {
  for (const [y, x0, x1] of spanRows(spans)) {
    p.hline(x0 - 1, y - 1, x1 - x0 + 3, OUT);
    p.hline(x0 - 1, y, x1 - x0 + 3, OUT);
    p.hline(x0 - 1, y + 1, x1 - x0 + 3, OUT);
  }
}

/** Gem shading: lit upper-left quadrant, shaded lower-right, mid tones between. */
function facetSpans(p: PixelPainter, spans: Spans): void {
  for (const [y, x0, x1] of spanRows(spans)) {
    const mid = (x0 + x1) / 2;
    for (let x = x0; x <= x1; x++) {
      const left = x <= mid;
      const c = y < AXIS ? (left ? SH[3] : SH[2]) : y > AXIS ? (left ? SH[2] : SH[1]) : left ? SH[3] : SH[1];
      p.px(x, y, c);
    }
  }
}

/** Diamond gaster, a small thorax and a hex head — the Hive's faceted ant body plan. */
const GASTER: Spans = [[0, 2, 8], [1, 3, 7], [2, 4, 6], [3, 5, 5]];
const THORAX: Spans = [[0, 11, 13], [1, 12, 12]];
const HEAD: Spans = [[0, 14, 16], [1, 14, 16], [2, 15, 15]];
const CURLED: Spans = [[0, 6, 14], [1, 7, 13], [2, 8, 12], [3, 9, 11], [4, 10, 10]];

/** Legs (upper side): hip, knee, foot. Back leg reaches back, front leg forward. */
const LEGS: ReadonlyArray<readonly [Px, Px, Px]> = [
  [[11, 9], [9, 6], [7, 4]],
  [[12, 9], [12, 6], [12, 3]],
  [[13, 9], [15, 6], [17, 4]],
];

/** Tripod gait: legs 0 and 2 on top swing with leg 1 below, then the other three. */
function legFootShift(frame: number, leg: number, upper: boolean): number {
  if (frame < 3) return 0;
  const groupA = upper ? leg !== 1 : leg === 1;
  return (frame === 3) === groupA ? 1 : -1;
}

/** Mid-cyan legs (dark teal vanishes on the violet ground) with bright knees and feet. */
function paintLegs(p: PixelPainter, frame: number, reach: 'tucked' | 'full'): void {
  LEGS.forEach(([hip, knee, foot], leg) => {
    for (const upper of [true, false]) {
      const fy = (y: number) => (upper ? y : AXIS * 2 - y);
      if (reach === 'tucked') {
        p.px(hip[0], fy(hip[1] - 1), SH[2]);
        continue;
      }
      const shift = legFootShift(frame, leg, upper);
      p.line(hip[0], fy(hip[1]), knee[0], fy(knee[1]), SH[2]);
      p.line(knee[0], fy(knee[1]), foot[0] + shift, fy(foot[1]), SH[2]);
      p.px(knee[0], fy(knee[1]), SH[4]);
      p.px(foot[0] + shift, fy(foot[1]), SH[3]);
    }
  });
}

/** One drone frame: 0 curled, 1 half open, 2 standing, 3 and 4 walking. */
function paintDrone(p: PixelPainter, frame: number): void {
  if (frame === 0) {
    // Curled into a faceted gem, pincers tucked, a cyan core showing
    outlineSpans(p, CURLED);
    facetSpans(p, CURLED);
    p.px(15, AXIS - 1, GOLD[1]);
    p.px(15, AXIS + 1, GOLD[1]);
    p.px(10, AXIS, PAL.crystal.shield);
    p.px(8, AXIS - 2, SH[4]);
    return;
  }
  const open = frame >= 2;
  paintLegs(p, frame, open ? 'full' : 'tucked');

  // Antennae with crystal tips (folded while half open)
  if (open) {
    mirrored(p, [[15, 7], [16, 6], [17, 5]], SH[2]);
    mirrored(p, [[18, 4]], SH[4]);
  } else {
    mirrored(p, [[16, 8]], SH[4]);
  }

  for (const spans of [GASTER, THORAX, HEAD]) outlineSpans(p, spans);
  p.hline(9, AXIS, 2, SH[1]); // petiole
  facetSpans(p, GASTER);
  facetSpans(p, THORAX);
  facetSpans(p, HEAD);
  p.px(4, AXIS - 1, SH[4]); // glint on the gaster's lit facet
  p.px(5, AXIS - 2, SH[4]);

  // Straight gold pincers, bright tips
  const reach = open ? 18 : 17;
  for (const y of [AXIS - 1, AXIS + 1]) {
    p.line(17, y, reach, y, GOLD[1]);
    p.px(reach + 1, y, open ? GOLD[2] : GOLD[1]);
  }
  // Eyes glow shield-cyan
  mirrored(p, [[15, 9]], PAL.crystal.shield);
}

/** Five pre-rendered frames facing right (+x), centered for rotation. */
export function buildDroneFrames(): OffscreenCanvas[] {
  return [0, 1, 2, 3, 4].map((frame) => {
    const c = new OffscreenCanvas(DRONE_FRAME_SIZE, DRONE_FRAME_SIZE);
    paintDrone(new PixelPainter(c.getContext('2d')!, DRONE_PX), frame);
    return c;
  });
}
