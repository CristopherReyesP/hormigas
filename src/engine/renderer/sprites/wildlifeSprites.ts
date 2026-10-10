// Neutral wildlife sprite recipes: the olive alien burrower (28×28, the beetle)
// and the straw alien leaper, internally the "cricket" (48×48). Authored facing
// right with symmetric interior shading; ArtPen adds the top-left light and the
// ground shadow after each turn.
import { ArtGrid } from '../pixelart/ArtGrid';
import { ArtPen } from '../pixelart/ArtPen';
import { directionAngle } from '../pixelart/directions';
import { PAL } from '../pixelart/palette';
import { SPRITE_GRID, WALK_FRAMES, walkFrame } from './spriteScale';

const GAIT = [1, 0, -1, 0];

export interface WildlifeSpriteSpec {
  frame: number;
  direction: number;
  /** Dithered ground shadow under the silhouette. */
  shadow?: boolean;
}

/**
 * 28×28 art-pixel beetle (the in-game "acorazado"), facing right. Not an
 * insect: an armored alien burrower with a low olive hide, four stubby
 * clawed legs, overlapping bony ash plates down its back, a toothy maw and a
 * small cluster of amber eyes. Muted, no glow, never the faction hues.
 */
export function paintBeetle({ frame, direction, shadow = true }: WildlifeSpriteSpec): ArtGrid {
  const grid = new ArtGrid(SPRITE_GRID.beetle);
  const p = new ArtPen(grid, directionAngle(direction));
  const B = PAL.beetle;
  const H = PAL.beetleAsh;
  const O = PAL.outline;
  const A = Math.floor(SPRITE_GRID.beetle / 2);
  const swing = GAIT[frame % GAIT.length];
  const mirror = (y: number): number => 2 * A - y;
  const gape = frame % 4 < 2 ? 1 : 0;

  // One silhouette: four stubby clawed legs (diagonal pairs step together),
  // the low hide and the blunt head
  p.outlined(pen => {
    for (let side = -1; side <= 1; side += 2) {
      for (const [hipX, pair] of [[9, 0], [17, 1]] as const) {
        const s = (pair + (side === 1 ? 1 : 0)) % 2 === 0 ? swing : -swing;
        const footX = hipX + s;
        pen.capsule(hipX, A + side * 5, footX, A + side * 7, 1.3, B[0]);
        pen.px(footX - 1, A + side * 9, B[0]); // claws
        pen.px(footX + 1, A + side * 9, B[0]);
      }
    }
    pen.ellipse(13, A, 9, 6.4, B[1]);
    pen.ellipse(21.5, A, 3.6, 4.2, B[1]);
  }, O);

  // Overlapping bony plates, tail first so each front plate laps the one behind
  for (const [x, ry] of [[6, 4], [10, 5.4], [14, 5.6], [18, 4.6]] as const) {
    p.ellipse(x, A, 2.6, ry, H[1]);
    p.line(x - 2, A - ry + 1, x - 2, A + ry - 1, H[0]); // the lapped rear edge in shadow
    p.line(x + 2, A - ry + 2, x + 2, A + ry - 2, H[2]); // a pale ridge on the leading edge
  }
  p.hline(5, A, 15, H[0]); // spine groove between the plate halves

  // Toothy maw: a black gash ringed by pale teeth, gaping on the step
  p.rect(24, A - 1 - gape, 2, 3 + gape * 2, PAL.black);
  for (const x of [23, 25]) {
    p.px(x, A - 2 - gape, H[2]);
    p.px(x, mirror(A - 2 - gape), H[2]);
  }
  p.px(24, A - 2 - gape, H[2]);
  p.px(24, mirror(A - 2 - gape), H[2]);

  // A small cluster of amber eyes above the maw
  p.px(21, A - 2, PAL.beetleEye);
  p.px(22, A - 1, PAL.beetleEye);
  p.px(22, A + 1, PAL.beetleEye);
  p.px(21, A + 2, PAL.beetleEye);

  p.shade([B, H]);
  p.sheen(13, A, 4, B[2]);
  if (shadow) p.castShadow(O, 1, 2);
  return grid;
}

/** Leaper poses: the walk cycle, the crouch (squash) and the leap (stretch). */
export type LeaperPose = 'walk' | 'crouch' | 'leap';

/** Baked leaper sheet columns: the 4 walk frames, then the crouch and the leap. */
export const LEAPER_FRAMES: ReadonlyArray<{ frame: number; pose: LeaperPose }> = [
  ...Array.from({ length: WALK_FRAMES }, (_, frame) => ({ frame, pose: 'walk' as const })),
  { frame: 0, pose: 'crouch' },
  { frame: 0, pose: 'leap' },
];

/** Sheet column of a pose; the walk pose follows the leg phase. */
export function leaperFrameIndex(pose: LeaperPose, legPhase: number): number {
  if (pose === 'crouch') return WALK_FRAMES;
  if (pose === 'leap') return WALK_FRAMES + 1;
  return walkFrame(legPhase);
}

export interface LeaperSpriteSpec extends WildlifeSpriteSpec {
  pose?: LeaperPose;
}

type Pt = readonly [number, number];

interface LeaperPlan {
  tail: number; // abdomen tip x (the barbed tail spike sits behind it)
  head: number; // head centre x
  knee: Pt; // hind-leg knee
  foot: Pt; // hind-leg foot
  front: readonly [Pt, Pt]; // front walking leg: knee, foot
  mid: readonly [Pt, Pt]; // middle walking leg: knee, foot
  antenna: readonly [Pt, Pt]; // antenna: barb joint, tip
}

/** Per-pose body plan, facing right; y offsets are for the top side (mirrored below). */
const LEAPER_PLAN: Record<LeaperPose, LeaperPlan> = {
  walk: {
    tail: 7, head: 32, knee: [13, -11], foot: [5, -5],
    front: [[31, -7], [33, -9]], mid: [[22, -7], [20, -9]],
    antenna: [[39, -6], [43, -10]],
  },
  // Squash: body pulled in, Z-legs folded tight and splayed wide, antennae laid back
  crouch: {
    tail: 9, head: 31, knee: [15, -13], foot: [11, -7],
    front: [[31, -8], [33, -11]], mid: [[23, -8], [21, -11]],
    antenna: [[38, -6], [41, -10]],
  },
  // Stretch: body drawn long, Z-legs kicked straight back, legs and antennae streamlined
  leap: {
    tail: 5, head: 34, knee: [12, -8], foot: [5, -7],
    front: [[28, -5], [25, -6]], mid: [[21, -5], [17, -6]],
    antenna: [[41, -4], [45, -5]],
  },
};

/**
 * 48×48 art-pixel alien leaper (the neutral "cricket", shown as Saltador),
 * facing right. Still wildlife: straw chitin, no glow, and DOMINANT Z-folded
 * jumping legs (thick femur out to the knee, a spined tibia folding back).
 * Alien: three black eyes a side, an abdomen of segmented chitin plates with
 * notched rims and dorsal nubs, a horned pronotum, barbed antennae and a
 * barbed tail spike. The crouch and leap poses are the squash and stretch of
 * its hop.
 */
export function paintCricket({ frame, direction, pose = 'walk', shadow = true }: LeaperSpriteSpec): ArtGrid {
  const grid = new ArtGrid(SPRITE_GRID.cricket);
  const p = new ArtPen(grid, directionAngle(direction));
  const C = PAL.cricket;
  const O = PAL.outline;
  const A = Math.floor(SPRITE_GRID.cricket / 2);
  const plan = LEAPER_PLAN[pose];
  const swing = pose === 'walk' ? GAIT[frame % GAIT.length] : 0;
  const flick = pose === 'walk' ? frame % 2 : 0;
  const hx = plan.head;
  const tail = plan.tail;
  const HIP_X = 20;

  // Abdomen half-height at x: a pointed tail flaring into a full plate body
  const half = (x: number): number => {
    if (x < tail + 2) return 1.5 * (x - tail);
    if (x < tail + 7) return 3 + (2 * (x - tail - 2)) / 5;
    return 5;
  };
  const seams: number[] = [];
  for (let x = tail + 4; x <= 20; x += 4) seams.push(x);

  for (let side = -1; side <= 1; side += 2) {
    // Plan offsets are for the top side (negative y); mirror them below
    const y = (dy: number): number => A - side * dy;

    // Hind Z-leg, the signature. Spined tibia first (it lies under the femur)
    const [kx, ky] = plan.knee;
    const fx = plan.foot[0] + Math.round(swing * 1.5);
    const fy = plan.foot[1];
    p.outlined(pen => pen.capsule(kx, y(ky), fx, y(fy), 0.6, C[0]), O);
    for (const t of [0.35, 0.7]) {
      const sx = Math.round(kx + (fx - kx) * t);
      const sy = Math.round(ky + (fy - ky) * t);
      p.px(sx - 1, y(sy - 2), C[1]); // tibia spines, pointing out and back
    }
    p.px(fx - 2, y(fy - 1), C[1]); // hooked claws
    p.px(fx - 2, y(fy + 1), C[1]);
    // Femur: a thick club from the hip out to the knee
    p.outlined(pen => {
      pen.capsule(HIP_X, y(-3), kx, y(ky + 1), 1.8, C[1]);
      pen.disc(kx, y(ky), 1.2, C[1]);
    }, O);
    p.line(HIP_X - 1, y(-4), kx + 1, y(ky + 2), C[2]); // femur ridge
    p.px(kx, y(ky), C[2]); // knee

    // Walking legs: two small elbowed pairs, alternating gait
    const sA = side === 1 ? swing : -swing;
    p.polyline([[24, y(-3)], [plan.mid[0][0], y(plan.mid[0][1])], [plan.mid[1][0] - sA, y(plan.mid[1][1])]], C[1]);
    p.polyline([[28, y(-3)], [plan.front[0][0], y(plan.front[0][1])], [plan.front[1][0] + sA, y(plan.front[1][1])]], C[1]);
  }

  // Abdomen: segmented chitin plates, seams across the body, a nub per plate
  p.outlined(pen => {
    pen.poly([[tail, A], [tail + 2, A - 3], [tail + 7, A - 5], [22, A - 5], [22, A + 5], [tail + 7, A + 5], [tail + 2, A + 3]], C[1]);
    for (const x of seams) {
      const h = Math.floor(half(x)) - 1;
      pen.vline(x, A - h, 2 * h + 1, C[0]);
    }
  }, O);
  for (const x of seams) {
    const h = Math.round(half(x));
    p.px(x, A - h, O); // rim notches: each plate reads on the silhouette
    p.px(x, A + h, O);
    p.px(x - 2, A, C[2]); // dorsal nub
  }
  p.px(seams[seams.length - 1] + 2, A, C[2]);

  // Barbed tail spike behind the abdomen tip
  p.line(tail - 1, A, tail - 3, A, C[1]);
  p.px(tail - 4, A, C[0]);
  p.px(tail - 3, A - 1, C[2]);
  p.px(tail - 3, A + 1, C[2]);

  // Head and neck first: the pronotum overlaps their rear
  p.outlined(pen => {
    pen.rect(26, A - 2, hx - 26, 5, C[1]);
    pen.ellipse(hx, A, 3.6, 4.2, C[1]);
  }, O);
  p.hline(hx - 1, A, 3, C[2]); // head crest
  // Pronotum: a darker horned plate
  p.outlined(pen => pen.poly([[22, A - 5], [24, A - 7], [27, A - 5], [27, A + 5], [24, A + 7], [22, A + 5]], C[0]), O);
  p.vline(24, A - 4, 9, C[1]); // keel

  for (let side = -1; side <= 1; side += 2) {
    // Three black eyes a side
    p.px(hx - 1, A + side * 3, PAL.black);
    p.px(hx, A + side * 3, PAL.black);
    p.px(hx + 2, A + side * 3, PAL.black);
    p.px(hx + 1, A + side, PAL.black);
    // Hooked mouthparts
    p.px(hx + 4, A + side, C[0]);
    p.px(hx + 5, A + side * 2, C[0]);
  }

  // Barbed antennae, flicking across frames
  for (let side = -1; side <= 1; side += 2) {
    const [[jx, jy], [tx, ty]] = plan.antenna;
    const y = (dy: number): number => A - side * dy;
    const tipY = ty + flick;
    p.polyline([[hx + 3, y(-2)], [jx, y(jy)], [tx, y(tipY)]], C[1]);
    p.px(jx - 1, y(jy - 1), C[2]); // barbs pointing back
    p.px(tx - 2, y(tipY - 1), C[2]);
    p.px(tx + 1, y(tipY + 1), C[1]); // forked tip
  }

  p.shade([C]);
  p.sheen(seams[1] ?? 14, A, 2, C[2]);
  p.sheen(hx, A, 2, C[2]);
  if (shadow) p.castShadow(O, 1, 2);
  return grid;
}
