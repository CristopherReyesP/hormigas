// The alien tarantula standing (3/4) for a tilted camera, on its own 88×88
// grid like its top-down sprite (frontierSprites.ts paintTarantula): the
// deep-space fur ramp, a shaggy abdomen crowned with teal crystal spines, the
// cephalothorax with its crown of eight glowing green eyes over two heavy
// fangs, and eight thick hairy legs whose knees rise above the low, heavy
// body. Same four screen-facing views, mirror and light rules as the spider
// (standingParts.ts). Its bite pose stands too: the front pair rears up (the
// classic threat pose) and the fangs gape (frame 0) or snap shut (frame 1),
// venom beading on their tips.
import type { ArtGrid } from '../pixelart/ArtGrid';
import type { ArtPen, ArtPoint } from '../pixelart/ArtPen';
import { PAL } from '../pixelart/palette';
import { SPRITE_GRID } from './spriteScale';
import {
  gaitGroupA, mirrorX, paintArchedLegs, paintView, pairedLegs,
  type PaintedView, type StandingLeg, type StandingView, type ThickLegStyle,
} from './standingParts';

const SIZE = SPRITE_GRID.tarantula;
const C = Math.floor(SIZE / 2);
const mx = mirrorX(C);

export interface StandingTarantulaSpec {
  view: StandingView;
  frame: number;
  /** The bite pose (frame 0 gapes, frame 1 snaps shut) instead of the walk. */
  bite?: boolean;
}

interface Ellipse { x: number; y: number; rx: number; ry: number }

/** One fang: the heavy chelicera (base → joint) and the hooked fang (joint → tip). */
interface Fang { base: ArtPoint; joint: ArtPoint; tip: ArtPoint }

type Rect = readonly [number, number, number, number];
type Stroke = readonly [number, number, number, number];
type LegTable = ReadonlyArray<readonly [ArtPoint, ArtPoint, ArtPoint]>;

interface TarantulaPose {
  abdomen: Ellipse;
  cephalothorax: Ellipse;
  /** Painted last of the two (nearer the viewer), and re-outlined over the other. */
  near: 'abdomen' | 'cephalothorax';
  /** Behind the body, darker (the far flank from the side). */
  farLegs: readonly StandingLeg[];
  /** Behind the body too, in the lit tones of the top-down legs. */
  legs: readonly StandingLeg[];
  /** Foot travel per gait step (the knee moves half of it). */
  swing: ArtPoint;
  /** The eye crown, as [x, y, w, h] rects. */
  eyes: readonly Rect[];
  fangs: readonly Fang[];
  /** Teal crystal spines, [x0, y0] (root) → [x1, y1] (tip), two px wide. */
  spines: readonly Stroke[];
}

/** Legs of one flank as seen from the side, hind → front (i = 0..3). */
function flank(side: number, hips: readonly ArtPoint[], knees: readonly ArtPoint[], feet: readonly ArtPoint[]): StandingLeg[] {
  return hips.map((hip, i) => ({ hip, knee: knees[i], foot: feet[i], groupA: gaitGroupA(i, side) }));
}

/** A front/back fang pair: the left one given, the right one mirrored. */
function pairedFangs(left: Fang): Fang[] {
  const m = ([x, y]: ArtPoint): ArtPoint => [mx(x), y];
  return [left, { base: m(left.base), joint: m(left.joint), tip: m(left.tip) }];
}

/** Symmetric rects/strokes for front/back views: the left ones given, the right ones mirrored. */
const pairedRects = (left: readonly Rect[]): Rect[] => left.flatMap(([x, y, w, h]) => [[x, y, w, h], [mx(x) - w + 1, y, w, h]] as Rect[]);
const pairedStrokes = (left: readonly Stroke[]): Stroke[] =>
  left.flatMap(([x0, y0, x1, y1]) => (x0 === C && x1 === C ? [[x0, y0, x1, y1]] : [[x0, y0, x1, y1], [mx(x0), y0, mx(x1), y1]]) as Stroke[]);

/** The front pair (leg 3) raised for the bite, the other legs as they stand. */
const rear = (legs: LegTable, raised: readonly [ArtPoint, ArtPoint, ArtPoint]): LegTable => [...legs.slice(0, 3), raised];

const FRONT_LEGS: LegTable = [
  [[34, 32], [20, 13], [9, 38]],
  [[33, 36], [12, 21], [4, 47]],
  [[33, 40], [17, 29], [9, 54]],
  [[35, 44], [26, 34], [22, 55]],
];
const BACK_LEGS: LegTable = [
  [[31, 44], [20, 36], [17, 55]],
  [[28, 38], [12, 28], [5, 49]],
  [[29, 30], [13, 17], [6, 39]],
  [[35, 22], [22, 8], [13, 25]],
];
const SIDE_HIPS = {
  far: [[48, 39], [51, 39], [54, 39], [57, 39]] as ArtPoint[],
  near: [[47, 43], [50, 43], [53, 43], [56, 43]] as ArtPoint[],
};
const SIDE_KNEES = {
  far: [[36, 21], [45, 17], [58, 17], [70, 23]] as ArtPoint[],
  near: [[31, 23], [41, 19], [56, 19], [67, 25]] as ArtPoint[],
};
const SIDE_FEET = {
  far: [[22, 51], [39, 52], [63, 52], [80, 50]] as ArtPoint[],
  near: [[14, 55], [32, 55], [60, 55], [78, 54]] as ArtPoint[],
};
/** Biting from the side, the front pair reaches up and forward at the prey. */
const raise = (points: readonly ArtPoint[], last: ArtPoint): ArtPoint[] => [...points.slice(0, 3), last];

/** How the fangs sit: walking (folded), gaping wide, or snapped shut. */
type Jaw = 'rest' | 'gape' | 'snap';

const FANGS: Record<PaintedView, Record<Jaw, Fang[]>> = {
  front: {
    rest: pairedFangs({ base: [39, 44], joint: [39, 48], tip: [41, 53] }),
    gape: pairedFangs({ base: [38, 44], joint: [36, 48], tip: [33, 53] }),
    snap: pairedFangs({ base: [39, 44], joint: [41, 48], tip: [43, 52] }),
  },
  back: { rest: [], gape: [], snap: [] },
  right: {
    rest: [{ base: [60, 42], joint: [63, 46], tip: [63, 51] }],
    gape: [{ base: [61, 42], joint: [65, 44], tip: [70, 46] }],
    snap: [{ base: [60, 42], joint: [63, 46], tip: [61, 50] }],
  },
};

function pose(view: PaintedView, bite: boolean, jaw: Jaw): TarantulaPose {
  const fangs = FANGS[view][jaw];
  switch (view) {
    // Toward the viewer: the eye crown and the fangs up front, the furry
    // abdomen a dome rising behind with its spines, legs arched out wide
    case 'front':
      return {
        abdomen: { x: C, y: 26, rx: 16, ry: 12 },
        cephalothorax: { x: C, y: 39, rx: 13, ry: 9 },
        near: 'cephalothorax',
        farLegs: [],
        legs: pairedLegs(C, bite ? rear(FRONT_LEGS, [[34, 42], [15, 27], [25, 2]]) : FRONT_LEGS),
        swing: [0, 2],
        eyes: pairedRects([[40, 35, 3, 3], [37, 33, 2, 2], [41, 32, 2, 2], [35, 36, 2, 2]]),
        fangs,
        spines: pairedStrokes([[C, 17, C, 10], [38, 17, 37, 11], [33, 20, 30, 15]]),
      };
    // Walking away: the big furry abdomen nearest, crystal spines all over
    // its back, the cephalothorax peeking over it, legs splayed
    case 'back':
      return {
        abdomen: { x: C, y: 35, rx: 19, ry: 15 },
        cephalothorax: { x: C, y: 19, rx: 11, ry: 7 },
        near: 'abdomen',
        farLegs: [],
        legs: pairedLegs(C, bite ? rear(BACK_LEGS, [[35, 20], [28, 5], [37, 1]]) : BACK_LEGS),
        swing: [0, -2],
        eyes: [],
        fangs,
        spines: pairedStrokes([
          [C, 24, C, 19], [36, 26, 34, 21], [30, 31, 26, 27], [40, 32, 39, 27], [C, 38, C, 33], [35, 40, 33, 36], [C, 45, C, 41],
        ]),
      };
    // Side (facing right): the heavy body slung low between high knees, the
    // abdomen behind with its spines, the eyes and fangs in front
    case 'right':
      return {
        abdomen: { x: 28, y: 36, rx: 15, ry: 11 },
        cephalothorax: { x: 54, y: 40, rx: 10, ry: 7 },
        near: 'cephalothorax',
        farLegs: flank(-1, SIDE_HIPS.far,
          bite ? raise(SIDE_KNEES.far, [69, 12]) : SIDE_KNEES.far,
          bite ? raise(SIDE_FEET.far, [81, 5]) : SIDE_FEET.far),
        legs: flank(1, SIDE_HIPS.near,
          bite ? raise(SIDE_KNEES.near, [66, 14]) : SIDE_KNEES.near,
          bite ? raise(SIDE_FEET.near, [78, 6]) : SIDE_FEET.near),
        swing: [4, 0],
        eyes: [[55, 34, 2, 2], [58, 35, 2, 2], [61, 37, 3, 3], [57, 38, 2, 2], [54, 37, 2, 2]],
        fangs,
        spines: [[20, 28, 17, 22], [26, 26, 24, 20], [32, 26, 31, 20], [38, 28, 38, 22], [15, 32, 11, 28]],
      };
  }
}

/** Deterministic 0..1 noise for the fur, as top-down. */
function hash(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) >>> 0;
  h = ((h ^ (h >> 13)) * 1274126177) >>> 0;
  return (h & 0xffff) / 0xffff;
}

/**
 * The alien tarantula standing in one of the four views, walking or biting.
 * No baked cast shadow (the renderer lays one on the tilted ground).
 */
export function paintStandingTarantula({ view, frame, bite = false }: StandingTarantulaSpec): ArtGrid {
  const T = PAL.tarantula;
  const jaw: Jaw = bite ? (frame % 2 === 0 ? 'gape' : 'snap') : 'rest';
  return paintView(SIZE, view, (p, painted) => {
    paintTarantulaPose(p, pose(painted, bite, jaw), frame, bite);
  }, (p, _grid, flip) => {
    const ab = pose(view === 'left' ? 'right' : view, bite, jaw).abdomen;
    p.shade([T]);
    p.sheen(flip(ab.x), ab.y, 5, T[3]);
  });
}

/** Hairs bristling off both sides of a thick leg segment, as top-down. */
function legHairs(p: ArtPen, a: ArtPoint, b: ArtPoint, w: number): void {
  const T = PAL.tarantula;
  const flat = Math.abs(b[1] - a[1]) <= Math.abs(b[0] - a[0]);
  for (let t = 0.15; t < 0.95; t += 0.15) {
    const x = Math.round(a[0] + (b[0] - a[0]) * t);
    const y = Math.round(a[1] + (b[1] - a[1]) * t);
    const lean = hash(x, y) < 0.5 ? -1 : 1;
    if (flat) {
      p.line(x, y - w - 1, x + lean, y - w - 3, T[3]);
      p.line(x, y + w + 1, x - lean, y + w + 2, T[2]);
    } else {
      p.line(x - w - 1, y, x - w - 3, y + lean, T[3]);
      p.line(x + w + 1, y, x + w + 3, y - lean, T[2]);
    }
  }
}

/** A fringe of hairs all around an ellipse, poking out past its outline. */
function fringe(p: ArtPen, e: Ellipse, hairs: number): void {
  const T = PAL.tarantula;
  for (let i = 0; i < hairs; i++) {
    const ang = (i / hairs) * Math.PI * 2 + hash(i, e.x + e.y) * 0.2;
    const len = 2 + Math.round(hash(e.x * 3 + e.y, i) * 2);
    p.line(
      Math.round(e.x + Math.cos(ang) * (e.rx - 1)), Math.round(e.y + Math.sin(ang) * (e.ry - 1)),
      Math.round(e.x + Math.cos(ang) * (e.rx + len)), Math.round(e.y + Math.sin(ang) * (e.ry + len)),
      i % 3 === 0 ? T[3] : T[2],
    );
  }
}

/** Short tufts of fur scattered across an ellipse's inside. */
function tufts(p: ArtPen, e: Ellipse, count: number): void {
  const T = PAL.tarantula;
  for (let i = 0; i < count; i++) {
    const dx = (hash(i, 7) - 0.5) * 2 * (e.rx - 3);
    const dy = (hash(7, i) - 0.5) * 2 * (e.ry - 3);
    if ((dx * dx) / ((e.rx - 3) ** 2) + (dy * dy) / ((e.ry - 3) ** 2) > 1) continue;
    const x = Math.round(e.x + dx);
    const y = Math.round(e.y + dy);
    p.line(x, y, x - 1, y + (hash(i, i) < 0.5 ? 2 : -2), i % 4 === 0 ? T[3] : T[1]);
  }
}

function paintTarantulaPose(p: ArtPen, pose: TarantulaPose, frame: number, bite: boolean): void {
  const T = PAL.tarantula;
  const O = PAL.outline;
  const ab = pose.abdomen;
  const ce = pose.cephalothorax;
  // Biting, it stands still on its planted legs
  const legFrame = bite ? 1 : frame;
  const hairy = (core: string): ThickLegStyle => ({ width: 2, core, segment: (a, b, w) => legHairs(p, a, b, w) });

  const farKnees = paintArchedLegs(p, pose.farLegs, legFrame, pose.swing, T[1], T[0], hairy(T[2]));
  const knees = paintArchedLegs(p, pose.legs, legFrame, pose.swing, T[2], T[1], hairy(T[3]));
  for (const [x, y] of [...farKnees, ...knees]) p.px(x, y, PAL.tarantulaBristle);

  const fangs = (pen: ArtPen) => {
    for (const f of pose.fangs) {
      pen.capsule(f.base[0], f.base[1], f.joint[0], f.joint[1], 3, T[1]);
      pen.capsule(f.joint[0], f.joint[1], f.tip[0], f.tip[1], 1, T[2]);
    }
  };
  const fill = {
    abdomen: (pen: ArtPen) => pen.ellipse(ab.x, ab.y, ab.rx, ab.ry, T[1]),
    cephalothorax: (pen: ArtPen) => {
      pen.ellipse(ce.x, ce.y, ce.rx, ce.ry, T[2]);
      fangs(pen);
    },
  };
  const inner = {
    abdomen: () => {
      p.ellipse(ab.x, ab.y, ab.rx - 3, ab.ry - 3, T[2]);
      tufts(p, ab, 60);
    },
    cephalothorax: () => {
      p.ellipse(ce.x, ce.y, ce.rx - 3, ce.ry - 3, T[3]);
      // The fangs over the thorax, a lit edge down each hook so they read
      fangs(p);
      for (const f of pose.fangs) p.line(f.joint[0], f.joint[1], f.tip[0], f.tip[1], T[3]);
    },
  };
  const far = pose.near === 'abdomen' ? 'cephalothorax' : 'abdomen';
  p.outlined(pen => { fill[far](pen); fill[pose.near](pen); }, O);
  inner[far]();
  fringe(p, pose[far], far === 'abdomen' ? 64 : 36);
  // The nearer part rings itself over the farther one
  p.outlined(fill[pose.near], O);
  inner[pose.near]();
  fringe(p, pose[pose.near], pose.near === 'abdomen' ? 72 : 40);

  // Crystal spines, two px wide
  for (const [x0, y0, x1, y1] of pose.spines) {
    p.line(x0, y0, x1, y1, PAL.tarantulaBristle);
    p.line(x0 + 1, y0, x1 + 1, y1, PAL.tarantulaBristle);
  }
  // The eye crown, over the fur
  for (const [x, y, w, h] of pose.eyes) p.rect(x, y, w, h, PAL.tarantulaEye);
  // Venom beads on the fang tips while it bites
  if (bite) for (const f of pose.fangs) p.rect(f.tip[0] - 1 + (f.tip[0] > C ? 1 : 0), f.tip[1] + 1, 2, 2, PAL.tarantulaBristle);
}
