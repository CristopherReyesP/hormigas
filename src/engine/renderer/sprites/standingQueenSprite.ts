// The brood queen standing (3/4) for a tilted camera, on her own 52×52 grid
// like her top-down sprite: the bloated, banded egg sac with the colony's
// densest vein network and eggs glowing through it, a small head with short
// scythes, and compact 2-px legs, in the same four screen-facing views and
// with the same mirror and light rules as the castes (standingParts.ts).
import type { ArtGrid } from '../pixelart/ArtGrid';
import type { ArtPen, ArtPoint } from '../pixelart/ArtPen';
import { PAL } from '../pixelart/palette';
import { SPRITE_GRID } from './spriteScale';
import {
  antennaPoints, gaitGroupA, mirrorX, paintLegs, paintView, pairedAntennae, pairedLegs,
  type PaintedView, type StandingAntenna, type StandingLeg, type StandingView,
} from './standingParts';

const SIZE = SPRITE_GRID.queen;
const C = Math.floor(SIZE / 2);
const mx = mirrorX(C);

export interface StandingQueenSpec {
  view: StandingView;
  frame: number;
  /** The breathing step: the egg sac swells by one art pixel. */
  swollen?: boolean;
}

interface QueenPose {
  /** Tail → head on screen. */
  axis: ArtPoint;
  sac: { x: number; y: number; rx: number; ry: number };
  thorax: { x: number; y: number; rx: number; ry: number };
  head: { x: number; y: number; r: number };
  links: ReadonlyArray<{ x: number; y: number; w: number; h: number }>;
  /** Far → near. */
  order: ReadonlyArray<'sac' | 'thorax' | 'head'>;
  ringed: ReadonlyArray<'sac' | 'thorax' | 'head'>;
  legs: readonly StandingLeg[];
  swing: ArtPoint;
  antennaeBehind: readonly StandingAntenna[];
  antennaeFront: readonly StandingAntenna[];
  eyes: readonly ArtPoint[];
  jaws: ReadonlyArray<readonly ArtPoint[]>;
  /** The vein spine down the sac's back, as seen: from its tail end toward the waist. */
  spine: readonly [ArtPoint, ArtPoint];
}

const POSES: Record<PaintedView, QueenPose> = {
  // Side (facing right): the top-down layout seen from her right flank and a
  // little above, the vein spine along the top of the sac
  right: {
    axis: [1, 0],
    sac: { x: 17, y: 21, rx: 11.5, ry: 8.5 },
    thorax: { x: 35, y: 25, rx: 3.4, ry: 2.8 },
    head: { x: 42, y: 23, r: 3.6 },
    links: [{ x: 29, y: 24, w: 3, h: 3 }, { x: 39, y: 23, w: 1, h: 3 }],
    order: ['sac', 'thorax', 'head'],
    ringed: [],
    legs: [-1, 1].flatMap(side => [33, 35, 37].map((hipX, i): StandingLeg => {
      const near = side === 1;
      const footX = hipX + (i - 1) * 4;
      return { hip: [hipX, near ? 27 : 26], knee: [hipX + (i - 1) * 2, near ? 29 : 28], foot: [footX, near ? 32 : 31], groupA: gaitGroupA(i, side) };
    })),
    swing: [1, 0],
    antennaeBehind: [{ points: [[42, 19], [42, 15], [45, 12]], tone: 2, flick: [0, 1] }],
    antennaeFront: [{ points: [[43, 20], [44, 16], [47, 13]], tone: 3, flick: [0, 1] }],
    eyes: [[43, 22], [44, 22]],
    jaws: [[[45, 25], [46, 26], [47, 26]], [[46, 24], [47, 24], [48, 25]]],
    spine: [[7, 16], [27, 16]],
  },
  // Toward the viewer: the small head low in front with both eyes and its
  // scythes, the thorax behind it, the egg sac a huge dome rising behind both
  front: {
    axis: [0, 1],
    sac: { x: C, y: 17, rx: 10, ry: 8 },
    thorax: { x: C, y: 26, rx: 3.6, ry: 2.2 },
    head: { x: C, y: 30, r: 3.4 },
    links: [],
    order: ['sac', 'thorax', 'head'],
    ringed: ['thorax', 'head'],
    legs: pairedLegs(C, [
      [[C - 2, 27], [C - 11, 26], [C - 14, 30]],
      [[C - 2, 28], [C - 10, 29], [C - 13, 34]],
      [[C - 2, 28], [C - 6, 31], [C - 7, 36]],
    ]),
    swing: [0, 1],
    antennaeBehind: [],
    // (dark lines across the pale sac behind them)
    antennaeFront: pairedAntennae(C, [C - 1, 27], [C - 3, 23], [C - 7, 21], 1, 1),
    eyes: [[C - 2, 29], [C - 3, 29], [mx(C - 2), 29], [mx(C - 3), 29]],
    jaws: [[[C - 2, 34], [C - 3, 35], [C - 2, 36], [C - 1, 36]], [[mx(C - 2), 34], [mx(C - 3), 35], [mx(C - 2), 36], [mx(C - 1), 36]]],
    spine: [[C, 10], [C, 24]],
  },
  // Walking away: the egg sac nearest and biggest, the vein spine running
  // down it to the tail; the thorax and the small head peek over it
  back: {
    axis: [0, -1],
    sac: { x: C, y: 26, rx: 10, ry: 8.6 },
    thorax: { x: C, y: 16, rx: 3.6, ry: 2.2 },
    head: { x: C, y: 13, r: 3 },
    links: [],
    order: ['head', 'thorax', 'sac'],
    ringed: ['thorax', 'sac'],
    legs: pairedLegs(C, [
      [[C - 2, 18], [C - 11, 27], [C - 12, 34]],
      [[C - 2, 17], [C - 12, 21], [C - 15, 27]],
      [[C - 2, 16], [C - 8, 15], [C - 12, 19]],
    ]),
    swing: [0, -1],
    antennaeBehind: pairedAntennae(C, [C - 1, 10], [C - 3, 6], [C - 7, 5], 3, -1),
    antennaeFront: [],
    eyes: [],
    jaws: [],
    spine: [[C, 33], [C, 19]],
  },
};

/**
 * The Swarm queen standing in one of the four views: the egg sac with its
 * tergite bands, fishbone vein network and glowing eggs, thorax, small head
 * with glowing eyes and short scythes, elbowed antennae and 2-px legs. No
 * baked cast shadow (the renderer lays it on the tilted ground).
 */
export function paintStandingQueen({ view, frame, swollen = false }: StandingQueenSpec): ArtGrid {
  const F = PAL.swarm.flesh;
  let sac = POSES.right.sac;
  return paintView(SIZE, view, (p, painted) => {
    const pose = POSES[painted];
    sac = paintQueenPose(p, pose, frame, swollen ? 1 : 0);
  }, (p, _grid, flip) => {
    const head = POSES[view === 'left' ? 'right' : view].head;
    p.shade([F]);
    p.sheen(flip(sac.x), sac.y, 5, F[4]);
    p.sheen(flip(sac.x), sac.y, 4, F[4]);
    p.sheen(flip(head.x), head.y, 2, F[4]);
  });
}

function paintQueenPose(p: ArtPen, pose: QueenPose, frame: number, grow: number): QueenPose['sac'] {
  const F = PAL.swarm.flesh;
  const V = PAL.swarm.vein;
  const O = PAL.swarm.outline;
  const grid = p.grid;
  const s = { ...pose.sac, rx: pose.sac.rx + grow, ry: pose.sac.ry + grow };
  const th = pose.thorax;
  const hd = pose.head;
  const [ux, uy] = pose.axis;
  const onBody = (x: number, y: number, color: string): void => {
    if (grid.isBody(Math.round(x), Math.round(y))) p.px(x, y, color);
  };

  const tips: ArtPoint[][] = [];
  for (const a of pose.antennaeBehind) {
    const pts = antennaPoints(a, frame);
    p.polyline(pts, F[a.tone]);
    tips.push(pts);
  }
  // Compact 2-px legs, a lighter flesh than her top-down outline-dark legs so they read on the ground
  paintLegs(p, pose.legs, frame, pose.swing, F[2], { center: C }, 2);

  const fill = {
    sac: (pen: ArtPen) => pen.ellipse(s.x, s.y, s.rx, s.ry, F[1]),
    thorax: (pen: ArtPen) => pen.ellipse(th.x, th.y, th.rx, th.ry, F[2]),
    head: (pen: ArtPen) => pen.disc(hd.x, hd.y, hd.r, F[3]),
  };
  p.outlined(pen => {
    for (const part of pose.order) fill[part](pen);
    for (const l of pose.links) pen.rect(l.x, l.y, l.w, l.h, F[1]);
  }, O);

  const details = {
    sac: () => {
      // Sac shading: dark flanks → body → lit core along the vein
      p.ellipse(s.x, s.y, s.rx - 2, s.ry - 2, F[2]);
      p.ellipse(s.x + ux * 0.5, s.y + uy * 0.5, s.rx - 5, s.ry - 4.5, F[3]);
      const side = ux !== 0;
      // Banded segments (tergites) across the sac, bowing toward the tail
      for (const t of [-9, -4, 1, 6]) {
        const along = side ? s.rx : s.ry;
        const acrossR = side ? s.ry : s.rx;
        const k = t / (along + 0.25);
        const h = Math.floor(acrossR * Math.sqrt(Math.max(0, 1 - k * k))) - 1;
        if (h < 2) continue;
        const bow = Math.round(h / 4);
        const [cx, cy] = [s.x + ux * t, s.y + uy * t];
        if (side) p.polyline([[cx - bow, cy - h], [cx, cy - Math.round(h / 2)], [cx, cy + Math.round(h / 2)], [cx - bow, cy + h]], F[1]);
        else p.polyline([[cx - h, cy - uy * bow], [cx - Math.round(h / 2), cy], [cx + Math.round(h / 2), cy], [cx + h, cy - uy * bow]], F[1]);
      }
      // Vein network: a bright spine with fishbone tributaries swept toward the tail
      const [[x0, y0], [x1, y1]] = pose.spine;
      p.line(x0, y0, x1, y1, V[1]);
      p.px(x0, y0, V[0]);
      p.px(x1, y1, V[0]);
      const n = 4;
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const bx = Math.round(x0 + (x1 - x0) * t);
        const by = Math.round(y0 + (y1 - y0) * t);
        // Toward the tail is -axis; tributaries run out to both flanks (the far one shorter from the side)
        for (const k of [-1, 1]) {
          const [wx, wy] = side ? [0, k] : [k, 0];
          // (from the side the near flank shows long tributaries, the far one only their roots)
          const reach = side ? (k < 0 ? 0.4 : 1.3) : 1;
          const a: ArtPoint = [bx + wx, by + wy];
          const b: ArtPoint = [Math.round(bx - ux * 2 + wx * 3 * reach), Math.round(by - uy * 2 + wy * 3 * reach)];
          const c: ArtPoint = [Math.round(bx - ux * 4 + wx * 6 * reach), Math.round(by - uy * 4 + wy * 6 * reach)];
          if (grid.isBody(...a)) p.line(a[0], a[1], b[0], b[1], V[1]);
          if (grid.isBody(...c)) p.line(b[0], b[1], c[0], c[1], V[0]);
        }
      }
      // Eggs glowing through the stretched skin, between the tributaries
      for (let i = 0; i < 3; i++) {
        const t = (i + 1) / n;
        const bx = Math.round(x0 + (x1 - x0) * t);
        const by = Math.round(y0 + (y1 - y0) * t);
        for (const k of [-1, 1]) {
          const [ex, ey] = side ? [bx - 1, by + (k < 0 ? -3 : 4)] : [bx + (k < 0 ? -6 : 5), by - uy];
          for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) onBody(ex + dx, ey + dy, F[4]);
        }
      }
    },
    thorax: () => {
      const node: ArtPoint = [th.x, th.y - (ux === 0 ? 1 : 0)];
      if (ux !== 0) p.hline(th.x - 2, th.y - 1, 5, V[0]);
      else p.hline(th.x - 1, node[1], 3, V[0]);
      p.px(node[0], node[1] - (ux !== 0 ? 1 : 0), V[1]);
      if (ux !== 0) p.px(30, th.y - 1, V[0]);
    },
    head: () => {
      for (const [ex, ey] of pose.eyes) p.px(ex, ey, V[1]);
    },
  };
  pose.order.forEach(part => {
    if (pose.ringed.includes(part)) p.outlined(fill[part], O);
    details[part]();
  });

  for (const jaw of pose.jaws) p.polyline(jaw, F[4]);
  for (const a of pose.antennaeFront) {
    const pts = antennaPoints(a, frame);
    p.polyline(pts, F[a.tone]);
    tips.push(pts);
  }
  return s;
}
