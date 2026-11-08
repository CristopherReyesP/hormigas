// The weaver spider standing (3/4) for a tilted camera, on its own 32×32 grid
// like its top-down sprite (frontierSprites.ts paintSpider): the bruised-violet
// ramp, the round abdomen with its red hourglass, the cephalothorax with a
// cluster of red eyes and pale fangs, and eight legs whose knees rise high
// above the body before the long shins drop to the ground. Same four
// screen-facing views, mirror and light rules as the ants (standingParts.ts).
// No bite pose (top-down has none either): biting replays the walk frames.
import type { ArtGrid } from '../pixelart/ArtGrid';
import type { ArtPen, ArtPoint } from '../pixelart/ArtPen';
import { PAL } from '../pixelart/palette';
import { SPRITE_GRID } from './spriteScale';
import {
  gaitGroupA, paintArchedLegs, paintView, pairedLegs,
  type PaintedView, type StandingLeg, type StandingView,
} from './standingParts';

const SIZE = SPRITE_GRID.spider;
const C = Math.floor(SIZE / 2);

export interface StandingSpiderSpec {
  view: StandingView;
  frame: number;
}

interface Ellipse { x: number; y: number; rx: number; ry: number }

interface SpiderPose {
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
  eyes: readonly ArtPoint[];
  /** The chelicerae: solid stubs under the eyes (part of the silhouette). */
  chelicerae: ReadonlyArray<{ x: number; y: number; w: number; h: number }>;
  /** Pale fang tips below the chelicerae. */
  fangs: readonly ArtPoint[];
  /** The hourglass, as [x0, y0, x1, y1] strokes in the mark red. */
  hourglass: ReadonlyArray<readonly [number, number, number, number]>;
}

/** Legs of one flank as seen from the side, hind → front (i = 0..3). */
function flank(side: number, hips: readonly ArtPoint[], knees: readonly ArtPoint[], feet: readonly ArtPoint[]): StandingLeg[] {
  return hips.map((hip, i) => ({ hip, knee: knees[i], foot: feet[i], groupA: gaitGroupA(i, side) }));
}

const POSES: Record<PaintedView, SpiderPose> = {
  // Side (facing right): the body slung low between the legs, the abdomen
  // behind, a glimpse of the hourglass on its top, eyes and fangs in front
  right: {
    abdomen: { x: 9.5, y: 13, rx: 5.5, ry: 4.2 },
    cephalothorax: { x: 18.5, y: 15, rx: 3.2, ry: 2.6 },
    near: 'cephalothorax',
    farLegs: flank(-1,
      [[15, 14], [17, 14], [18, 14], [20, 14]],
      [[11, 6], [16, 4], [22, 4], [27, 7]],
      [[7, 17], [14, 17], [24, 17], [30, 16]]),
    legs: flank(1,
      [[15, 16], [16, 16], [18, 16], [19, 16]],
      [[8, 7], [13, 5], [20, 5], [25, 8]],
      [[4, 19], [10, 19], [21, 19], [29, 19]]),
    swing: [2, 0],
    eyes: [[19, 13], [20, 13], [21, 14], [20, 15], [21, 12]],
    chelicerae: [{ x: 20, y: 17, w: 2, h: 2 }],
    fangs: [[22, 19], [21, 19]],
    hourglass: [[7, 10, 11, 10], [7, 12, 11, 12], [7, 10, 11, 12], [7, 12, 11, 10]],
  },
  // Toward the viewer: the eye cluster and fangs up front, the abdomen a
  // dome rising behind, four legs a side arched high and splayed out
  front: {
    abdomen: { x: C, y: 8, rx: 5.6, ry: 4.4 },
    cephalothorax: { x: C, y: 13, rx: 4, ry: 3 },
    near: 'cephalothorax',
    farLegs: [],
    legs: pairedLegs(C, [
      [[13, 11], [9, 2], [5, 10]],
      [[13, 12], [5, 4], [1, 14]],
      [[13, 13], [7, 7], [3, 18]],
      [[13, 14], [10, 10], [8, 19]],
    ]),
    swing: [0, 1],
    eyes: [[C - 3, 11], [C + 3, 11], [C - 2, 12], [C - 1, 12], [C + 1, 12], [C + 2, 12], [C - 1, 13], [C + 1, 13]],
    chelicerae: [{ x: C - 2, y: 16, w: 2, h: 2 }, { x: C + 1, y: 16, w: 2, h: 2 }],
    fangs: [[C - 1, 18], [C + 1, 18], [C - 1, 19], [C + 1, 19]],
    hourglass: [],
  },
  // Walking away: the round abdomen nearest and biggest with the red
  // hourglass on it, the cephalothorax peeking over it, legs splayed
  back: {
    abdomen: { x: C, y: 12.5, rx: 6.5, ry: 5.5 },
    cephalothorax: { x: C, y: 6, rx: 3.4, ry: 2.4 },
    near: 'abdomen',
    farLegs: [],
    legs: pairedLegs(C, [
      [[12, 13], [8, 9], [7, 19]],
      [[12, 11], [5, 6], [2, 17]],
      [[13, 9], [5, 3], [1, 12]],
      [[13, 7], [9, 1], [4, 7]],
    ]),
    swing: [0, -1],
    eyes: [],
    chelicerae: [],
    fangs: [],
    hourglass: [[C - 2, 9, C + 2, 9], [C - 2, 15, C + 2, 15], [C - 2, 9, C + 2, 15], [C + 2, 9, C - 2, 15], [C, 11, C, 13]],
  },
};

/**
 * The weaver spider standing in one of the four views. No baked cast shadow
 * (the renderer lays one on the tilted ground).
 */
export function paintStandingSpider({ view, frame }: StandingSpiderSpec): ArtGrid {
  const S = PAL.spider;
  return paintView(SIZE, view, (p, painted) => paintSpiderPose(p, POSES[painted], frame), (p, _grid, flip) => {
    const ab = POSES[view === 'left' ? 'right' : view].abdomen;
    p.shade([S]);
    p.sheen(flip(ab.x), ab.y, 3, S[3]);
  });
}

function paintSpiderPose(p: ArtPen, pose: SpiderPose, frame: number): void {
  const S = PAL.spider;
  const O = PAL.outline;
  const ab = pose.abdomen;
  const ce = pose.cephalothorax;

  paintArchedLegs(p, pose.farLegs, frame, pose.swing, S[2], S[1]);
  paintArchedLegs(p, pose.legs, frame, pose.swing, S[3], S[2]);

  const fill = {
    abdomen: (pen: ArtPen) => pen.ellipse(ab.x, ab.y, ab.rx, ab.ry, S[1]),
    cephalothorax: (pen: ArtPen) => {
      pen.ellipse(ce.x, ce.y, ce.rx, ce.ry, S[2]);
      for (const c of pose.chelicerae) pen.rect(c.x, c.y, c.w, c.h, S[2]);
    },
  };
  const far = pose.near === 'abdomen' ? 'cephalothorax' : 'abdomen';
  p.outlined(pen => { fill[far](pen); fill[pose.near](pen); }, O);
  if (far === 'abdomen') p.ellipse(ab.x, ab.y, ab.rx - 1, ab.ry - 1, S[2]);
  // The nearer part rings itself over the farther one
  p.outlined(fill[pose.near], O);
  if (pose.near === 'abdomen') p.ellipse(ab.x, ab.y, ab.rx - 1, ab.ry - 1, S[2]);

  for (const [x0, y0, x1, y1] of pose.hourglass) p.line(x0, y0, x1, y1, PAL.spiderMark);
  for (const [x, y] of pose.eyes) p.px(x, y, PAL.spiderMark);
  for (const [x, y] of pose.fangs) p.px(x, y, S[3]);
}
