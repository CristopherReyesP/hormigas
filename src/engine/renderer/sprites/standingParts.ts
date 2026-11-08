// Shared parts of the standing (3/4) sprites: the four screen-facing views,
// which one a screen heading picks, and the pieces every standing recipe
// paints the same way (elbowed legs on the tripod gait, high-kneed arachnid
// legs, flicking antennae, the left view mirrored from the right one before
// the light pass).
//
// Views are authored on screen (ArtPen at angle 0, never turned). The right
// view is painted, the left view is that recipe mirrored about the pivot
// column BEFORE the light pass, so the top-left light never flips.
import { ArtGrid, mirrorArtGrid } from '../pixelart/ArtGrid';
import { ArtPen, type ArtPoint } from '../pixelart/ArtPen';

export const STANDING_VIEWS = ['front', 'back', 'left', 'right'] as const;
export type StandingView = typeof STANDING_VIEWS[number];
/** The views that are painted; 'left' reuses 'right' mirrored. */
export type PaintedView = Exclude<StandingView, 'left'>;

const QUARTER = Math.PI / 2;
const TIE = 1e-9;

/**
 * The view of an ant whose heading, as the screen shows it, is
 * `screenHeading` (radians, 0 = right, canvas y down): walking down the
 * screen it faces the viewer (front), up the screen it shows its back.
 * Exact diagonals go to the side views, so mirrored headings get mirrored views.
 */
export function standingView(screenHeading: number): StandingView {
  const turns = ((screenHeading / QUARTER) % 4 + 4) % 4; // quarter turns in [0, 4)
  const lo = Math.floor(turns);
  // On an exact diagonal pick the even neighbour (0 = right, 2 = left)
  const nearest = Math.abs(turns - lo - 0.5) < TIE ? (lo % 2 === 0 ? lo : lo + 1) : Math.round(turns);
  return (['right', 'front', 'left', 'back'] as const)[nearest % 4];
}

export const paintedView = (view: StandingView): PaintedView => (view === 'left' ? 'right' : view);

/** Tripod-gait swing offsets (art px) for the 4-frame walk cycle, as top-down. */
export const GAIT = [1, 0, -1, 0];

/**
 * Tripod gait groups, as top-down: leg `i` (0 = hind, 1 = mid, 2 = front)
 * of side -1/+1 swings with group A when this is true.
 */
export const gaitGroupA = (i: number, side: number): boolean => (i + (side === 1 ? 1 : 0)) % 2 === 0;

/** One leg as seen in a view, at rest; the gait moves its foot along the pose's swing. */
export interface StandingLeg { hip: ArtPoint; knee: ArtPoint; foot: ArtPoint; groupA: boolean }

/** Antenna root → elbow → tip; the tip flicks by `flick` px on odd frames. */
export interface StandingAntenna { points: readonly [ArtPoint, ArtPoint, ArtPoint]; tone: number; flick: ArtPoint }

/** Horizontal mirror about pixel column `center`. */
export const mirrorX = (center: number) => (x: number): number => 2 * center - x;

/**
 * Legs of a front/back view: `left` lists the legs left of `center` as
 * [hip, knee, foot] by leg index (0 = hind, 1 = mid, 2 = front); the right
 * side is their mirror. Gait groups follow the top-down tripod.
 */
export function pairedLegs(center: number, left: ReadonlyArray<readonly [ArtPoint, ArtPoint, ArtPoint]>): StandingLeg[] {
  const mx = mirrorX(center);
  const legs: StandingLeg[] = [];
  for (const side of [-1, 1]) {
    left.forEach((pts, i) => {
      const [hip, knee, foot] = side < 0 ? pts : pts.map(([x, y]) => [mx(x), y] as const);
      legs.push({ hip, knee, foot, groupA: gaitGroupA(i, side) });
    });
  }
  return legs;
}

/** A front/back antenna pair: the left one given, the right one mirrored. */
export function pairedAntennae(center: number, root: ArtPoint, elbow: ArtPoint, tip: ArtPoint, tone: number, flickY: number): StandingAntenna[] {
  const mx = mirrorX(center);
  const m = ([x, y]: ArtPoint): ArtPoint => [mx(x), y];
  return [
    { points: [root, elbow, tip], tone, flick: [0, flickY] },
    { points: [m(root), m(elbow), m(tip)], tone, flick: [0, flickY] },
  ];
}

/**
 * Paint the legs behind the body on the tripod gait: each foot moves by
 * `swing` per gait step. `thick` adds a second strand `thick` px beside each
 * leg (toward the body's centre column `center`) for 2-px stout legs.
 * Returns the knees, where leg-spur marks grow.
 */
export function paintLegs(
  p: ArtPen, legs: readonly StandingLeg[], frame: number, swing: ArtPoint, color: string,
  thick: { center: number } | null = null, stride = 1,
): ArtPoint[] {
  const step = GAIT[frame % GAIT.length] * stride;
  for (const leg of legs) {
    const s = leg.groupA ? step : -step;
    const foot: ArtPoint = [leg.foot[0] + swing[0] * s, leg.foot[1] + swing[1] * s];
    p.polyline([leg.hip, leg.knee, foot], color);
    if (thick) {
      // Side views thicken toward the tail (like top-down), front/back toward the body
      const dx = swing[0] !== 0 ? -1 : leg.hip[0] < thick.center ? 1 : -1;
      p.polyline([[leg.hip[0] + dx, leg.hip[1]], [leg.knee[0] + dx, leg.knee[1]], [foot[0] + dx, foot[1]]], color);
    }
  }
  return legs.map(l => l.knee);
}

/**
 * Paint arachnid legs on the alternating-pairs gait: each leg rises from the
 * hip to a knee held high above the body, then drops its long shin to the
 * foot on the ground. Per gait step the foot moves `swing` px and the knee
 * half of it (as top-down: knee ±1, foot ±2). Flat segments are two
 * strands thick (`lit` over `dark`), steep ones one `lit` px; the knee is
 * `lit` so the joint reads.
 * Returns the knees.
 */
export function paintArchedLegs(
  p: ArtPen, legs: readonly StandingLeg[], frame: number, swing: ArtPoint, lit: string, dark: string,
): ArtPoint[] {
  const step = GAIT[frame % GAIT.length];
  const knees: ArtPoint[] = [];
  for (const leg of legs) {
    const s = leg.groupA ? step : -step;
    const knee: ArtPoint = [leg.knee[0] + Math.trunc(swing[0] * s / 2), leg.knee[1] + Math.trunc(swing[1] * s / 2)];
    const foot: ArtPoint = [leg.foot[0] + swing[0] * s, leg.foot[1] + swing[1] * s];
    for (const [a, b] of [[leg.hip, knee], [knee, foot]] as const) {
      // The shadow strand sits under a flat segment only: steep shins stay one
      // px thin, so the legs of a side never merge into a comb
      if (Math.abs(b[1] - a[1]) <= Math.abs(b[0] - a[0])) p.line(a[0], a[1] + 1, b[0], b[1] + 1, dark);
    }
    p.polyline([leg.hip, knee, foot], lit);
    p.px(knee[0], knee[1], lit);
    knees.push(knee);
  }
  return knees;
}

/** An antenna's points on `frame` (the tip flicks on odd frames). */
export function antennaPoints(a: StandingAntenna, frame: number): ArtPoint[] {
  const [root, elbow, tip] = a.points;
  const flick = frame % 2;
  return [root, elbow, [tip[0] + a.flick[0] * flick, tip[1] + a.flick[1] * flick]];
}

/**
 * Paint a standing view on a `size` grid: `recipe` paints the painted view
 * (the right one for 'left'), the grid is mirrored about the pivot column for
 * 'left', then `light` runs in screen space with `flip` mapping painted
 * x to the final grid's x.
 */
export function paintView(
  size: number, view: StandingView,
  recipe: (p: ArtPen, painted: PaintedView) => void,
  light: (p: ArtPen, grid: ArtGrid, flip: (x: number) => number) => void,
): ArtGrid {
  const center = Math.floor(size / 2);
  let grid = new ArtGrid(size);
  recipe(new ArtPen(grid), paintedView(view));
  let flip = (x: number): number => x;
  if (view === 'left') {
    grid = mirrorArtGrid(grid, center);
    flip = mirrorX(center);
  }
  light(new ArtPen(grid), grid, flip);
  return grid;
}
