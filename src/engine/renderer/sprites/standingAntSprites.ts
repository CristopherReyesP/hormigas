// Standing (3/4) Swarm ant views for a tilted camera: the ant seen from
// slightly above and in front, like a classic 2D RPG/RTS character, in four
// screen-facing views (front = toward the viewer, back = away, left, right).
// Same 24×24 grid, flesh ramp, vein, outline and light rules as the top-down
// sprites in swarmSprites.ts, and every caste's views are DERIVED from its
// top-down anatomy (swarmCaste), so a caste reads the same standing up: the
// soldier's big head and scythes, the scout's long legs and antennae, the
// nurse's pale slim body and nectar droplet, the defender's shield, horn and
// plates, the bomber's huge glowing gaster.
import { AntRole } from '../../../game/components/components';
import type { ArtGrid } from '../pixelart/ArtGrid';
import type { ArtPen, ArtPoint } from '../pixelart/ArtPen';
import { PAL } from '../pixelart/palette';
import { ART_PX, SPRITE_GRID, spritePivot } from './spriteScale';
import { NO_MARKS, markStacks, marksForRole, type AntMarkId, type AntMarks } from './antMarks';
import { swarmCaste, type AntGlowPoint, type SwarmCaste } from './swarmSprites';
import {
  antennaPoints, gaitGroupA, mirrorX, paintLegs, paintView, paintedView, pairedAntennae, pairedLegs,
  type PaintedView, type StandingAntenna, type StandingLeg, type StandingView,
} from './standingParts';

export { STANDING_VIEWS, standingView, type StandingView } from './standingParts';
export { paintStandingQueen, type StandingQueenSpec } from './standingQueenSprite';

/** Castes that have standing 3/4 views (the others would stand up their top-down sprite). */
export function hasStandingView(role: AntRole): boolean {
  return Object.values(AntRole).includes(role);
}

const CENTER = Math.floor(SPRITE_GRID.ant / 2);
const mx = mirrorX(CENTER);

interface Ellipse { x: number; y: number; rx: number; ry: number }
type PartName = 'gaster' | 'thorax' | 'head';

/**
 * Where each body part of a caste sits in one painted view (the left view
 * reuses the right one). `axis` is the screen direction from tail to head;
 * the gaster's radii are given along and across that axis.
 */
interface Pose {
  axis: ArtPoint;
  gaster: { x: number; y: number; along: number; across: number };
  /** Offset of the dorsal vein line from the part centres. */
  dorsal: ArtPoint;
  thorax: Ellipse;
  head: Ellipse;
  /** The defender's shield plate, painted instead of the round head. */
  shield: { x: number; y: number; w: number; h: number } | null;
  links: readonly ArtPoint[];        // petiole + neck pixels
  /** Body parts far → near; `ringed` parts keep their own rim over the farther ones. */
  order: readonly PartName[];
  ringed: readonly PartName[];
  legs: readonly StandingLeg[];
  swing: ArtPoint;                   // how one gait step moves a foot
  antennaeBehind: readonly StandingAntenna[];
  antennaeFront: readonly StandingAntenna[];
  eyes: readonly ArtPoint[];
  /** Eye pixels stacked upward from each eye point (big faceted eyes facing the viewer). */
  eyeHeight: number;
  /** Where big compound eyes (the mark) bulge past the head's flanks seen from behind. */
  rearEyes: readonly ArtPoint[];
  /** A dark mouth line between the jaws' roots (the face seen head-on). */
  mouth: readonly ArtPoint[];
  jawsBehind: ReadonlyArray<{ points: readonly ArtPoint[]; tone: number }>;
  jaws: ReadonlyArray<{ points: readonly ArtPoint[]; tone: number }>;
  /** Acid drips of chartreuse jaws, nearest the jaw tips. */
  drips: readonly ArtPoint[];
  /** Horizontal offsets from the gaster centre of the 1-px bone spines on its upper rim. */
  spines: readonly number[];
  /** Horizontal offsets of the sentinel crest pixels on the gaster's upper rim, by stack. */
  crest: readonly number[];
  horn: ReadonlyArray<{ points: readonly ArtPoint[]; tone: number }>;
  droplet: readonly ArtPoint[];
  /** Wing-stub roots on the thorax and their (unit-ish) sweep direction. */
  wings: ReadonlyArray<{ base: ArtPoint; dir: ArtPoint }>;
  load: { x: number; y: number; behind: boolean; rx: number; ry: number };
  /** Where the vein shows: the gaster point and whether the thorax node is visible. */
  gasterGlow: number;                // along offset of the visible gaster vein point
  thoraxVisible: boolean;
}

const rel = (p: ArtPoint, o: ArtPoint): ArtPoint => [p[0] - o[0], p[1] - o[1]];
const len = ([x, y]: ArtPoint): number => Math.hypot(x, y);

/** The 1, 2 or 3 bone-spine pair offsets on a front/back rim. */
const rimSpines = (n: number): number[] => (n === 0 ? [] : n === 1 ? [-2, 2] : [-3, -1, 1, 3, -2, 2].slice(0, 2 * n));

/** Side view (facing right): the top-down body plan seen from its right flank and a little above. */
function sidePose(c: Readonly<SwarmCaste>): Pose {
  // Keep the tail 2 px off the left edge, so the mirrored left view fits the grid
  const shift = Math.max(0, 3 - Math.ceil(c.gx - c.grx - 0.25));
  const X = (x: number): number => x + shift;
  // Longer legs lift the body higher above the feet (scout), short legs lower it (soldier, defender)
  const belly = 12.6 - (c.reach - 6);
  const gh = c.gry * 0.9;
  const gy = Math.round(belly - gh);
  const thY = Math.round(belly - 0.2 - c.thRy);
  const hy = Math.round(belly - 1.6 - c.hR);
  const hx = X(c.hX);
  const hipNear = Math.round(belly) - 1;

  const legs: StandingLeg[] = [-1, 1].flatMap(side => c.hips.map((hip, i): StandingLeg => {
    const near = side === 1;
    const hipX = X(hip);
    const footX = hipX + (i - 1) * c.splay;
    const hipY = near ? hipNear : hipNear - 1;
    const footY = near ? 16 : 15;
    return {
      hip: [hipX, hipY],
      knee: [Math.round(hipX + (footX - hipX) * 0.6), Math.round((hipY + footY) / 2)],
      foot: [footX, footY],
      groupA: gaitGroupA(i, side),
    };
  }));

  // Antennae keep their top-down shape, lifted from the head
  const [root, elbow, tip] = c.antenna.map(p => rel(p, [c.hX, CENTER]));
  const at = ([dx, dy]: ArtPoint, ox = 0, oy = 0): ArtPoint => [hx + dx + ox, Math.max(1, hy + dy + oy)];
  // Jaws keep their top-down stroke: outward from the axis becomes upward
  const y0 = c.jaws[0].points[0][1];
  const jaw = (pts: readonly ArtPoint[], dy = 0): ArtPoint[] => pts.map(([x, y]) => [X(x), hy + 1 + (y - y0) + dy]);
  const main = c.jaws[0];

  return {
    axis: [1, 0],
    gaster: { x: X(c.gx), y: gy, along: c.grx, across: gh },
    dorsal: [0, -1],
    thorax: { x: X(c.thCx), y: thY, rx: c.thRx, ry: c.thRy },
    head: { x: hx, y: hy, rx: c.hR, ry: c.hR },
    shield: c.shieldHead ? { x: hx - 2, y: hy - 3, w: 5, h: 6 } : null,
    links: [...c.petiole.map((x): ArtPoint => [X(x), thY]), ...(c.neck !== null ? [[X(c.neck), Math.round((thY + hy) / 2)] as ArtPoint] : [])],
    order: ['gaster', 'thorax', 'head'],
    ringed: [],
    legs,
    swing: [1, 0],
    antennaeBehind: [{ points: [at(root, -1), at(elbow, -2, -1), at(tip, -2, -1)], tone: 1, flick: [0, 1] }],
    antennaeFront: [{ points: [at(root), at(elbow), at(tip)], tone: 2, flick: [0, 1] }],
    eyes: [[hx + 1, hy - 1]],
    eyeHeight: 1,
    rearEyes: [],
    mouth: [],
    jawsBehind: main.points.length > 1 ? [{ points: jaw(main.points.slice(1), -1), tone: 3 }] : [],
    jaws: c.jaws.map(j => ({ points: jaw(j.points), tone: j.tone })),
    drips: [[X(c.hX + 5), hy + 2], [X(c.hX + 4), hy + 2]],
    spines: c.spines.map(([sx]) => sx - c.gx),
    crest: [0, 1, 2, 3, 4, 5].map(i => Math.round(c.grx - 2) - i),
    horn: c.horn ? [
      { points: [[hx + 3, hy], [hx + 5, hy]], tone: 4 },
      { points: [[hx + 3, hy - 1]], tone: 3 },
      { points: [[hx + 3, hy + 1]], tone: 3 },
    ] : [],
    droplet: c.droplet ? [[X(c.mouth), hy + 1], [X(c.mouth) + 1, hy + 1]] : [],
    wings: [{ base: [X(c.thCx) - 1, thY - 1], dir: [-1, -0.6] }],
    load: { x: X(c.mouth) + 1, y: hy + 1, behind: false, rx: 1.2, ry: 1.8 },
    gasterGlow: 0,
    thoraxVisible: true,
  };
}

/**
 * Front/back leg rest positions, left of centre, by depth (near legs reach
 * lowest on screen): [knee, foot] offsets from the centre column for the
 * near, mid and far leg. `reach` widens the stance (scout, nurse) or
 * narrows it (soldier, defender), like the top-down leg reach.
 */
type LegDepths = readonly [readonly [ArtPoint, ArtPoint], readonly [ArtPoint, ArtPoint], readonly [ArtPoint, ArtPoint]];
// From the front the legs stay low, under the rising antennae
const FRONT_LEGS: LegDepths = [[[4, 12], [5, 16]], [[6, 11], [9, 14]], [[6, 9], [9, 11]]];
// From behind they rise higher beside the small far head
const BACK_LEGS: LegDepths = [[[5, 11], [6, 16]], [[6, 9], [9, 14]], [[5, 7], [8, 11]]];

function splayedLegs(c: Readonly<SwarmCaste>, hipY: number, depths: LegDepths, order: readonly [number, number, number]): StandingLeg[] {
  const k = Math.round((c.reach - 6) * 0.5);
  const k2 = c.reach - 6;
  const hip: ArtPoint = [CENTER - 1, hipY];
  const left: Array<readonly [ArtPoint, ArtPoint, ArtPoint]> = [];
  order.forEach((d, i) => {
    const [[kx, ky], [fx, fy]] = depths[d];
    // (the near leg only lengthens: its knee stays beside the head)
    left[i] = [hip, [CENTER - kx - k, d === 0 ? ky : ky - k], [CENTER - fx - (d === 0 ? k : k2), fy]];
  });
  return pairedLegs(CENTER, left);
}

/**
 * A front/back antenna pair from the top-down scape and funiculus lengths:
 * the scape runs along `scapeDir`, the funiculus bends along `tipDir`.
 */
function splayedAntennae(c: Readonly<SwarmCaste>, root: ArtPoint, scapeDir: ArtPoint, tipDir: ArtPoint, tone: number, flickY: number): StandingAntenna[] {
  const [r, e, t] = c.antenna;
  const scape = len(rel(e, r));
  const funiculus = len(rel(t, e));
  const elbow: ArtPoint = [Math.round(root[0] + scapeDir[0] * scape), Math.round(root[1] + scapeDir[1] * scape)];
  const tip: ArtPoint = [Math.round(elbow[0] + tipDir[0] * funiculus), Math.max(1, Math.round(elbow[1] + tipDir[1] * funiculus))];
  return pairedAntennae(CENTER, root, elbow, tip, tone, flickY);
}

const mirrorStroke = (pts: readonly ArtPoint[]): ArtPoint[] => pts.map(([x, y]) => [mx(x), y]);
const bothSides = (strokes: ReadonlyArray<{ points: readonly ArtPoint[]; tone: number }>) =>
  strokes.flatMap(s => [s, { points: mirrorStroke(s.points), tone: s.tone }]);

/**
 * Walking toward the viewer: the head is nearest, low and wide, with both
 * eyes on its flanks and the jaws below it; the thorax hides behind it and
 * the gaster rises above both as a foreshortened dome. The legs splay out
 * to both sides, the near (front) feet lowest.
 */
function frontPose(c: Readonly<SwarmCaste>): Pose {
  const hy = 12;
  // Nearest the viewer, the head is drawn bigger than top-down, and wider than tall
  const rx = c.shieldHead ? 4 : c.hR * 1.2 + 0.3;
  const ry = c.shieldHead ? 2 : Math.min(2.8, c.hR * 1.1);
  const thH = c.thRx * 0.6;
  const thY = Math.round(hy - ry - thH);
  const gh = c.grx * 0.6;
  const gy = thY - Math.round(thH + gh * 0.8);
  const by = Math.min(15, hy + Math.round(ry) + 1); // jaw row, just under the head
  const n = c.jaws[0].points.length;
  // The caste's jaw from the front, left side: blunt, short, hooked, or long crossing scythes
  const jaw: Array<{ points: ArtPoint[]; tone: number }> =
    n >= 5 ? [
      { points: [[CENTER - 3, by - 1], [CENTER - 4, by], [CENTER - 4, by + 1], [CENTER - 3, by + 2], [CENTER - 2, by + 2], [CENTER - 1, by + 1]], tone: 4 },
      { points: [[CENTER - 3, by], [CENTER - 3, by + 1]], tone: 3 },
    ] :
    n >= 3 ? [{ points: [[CENTER - 2, by], [CENTER - 3, by + 1], [CENTER - 2, by + 2]], tone: 4 }] :
    n === 2 ? [{ points: [[CENTER - 2, by], [CENTER - 1, by + 1]], tone: 4 }] :
    [{ points: [[CENTER - 2, by - 1], [CENTER - 1, by]], tone: 4 }];
  const ex = Math.max(1, Math.round(rx) - 1);
  const ey = c.shieldHead ? 0 : c.hR >= 2.5 ? -1 : 0;
  return {
    axis: [0, 1],
    gaster: { x: CENTER, y: gy, along: gh, across: c.gry },
    dorsal: [0, 0],
    thorax: { x: CENTER, y: thY, rx: c.thRy + 0.3, ry: thH },
    head: { x: CENTER, y: hy, rx, ry },
    shield: c.shieldHead ? { x: CENTER - 4, y: hy - 2, w: 9, h: 5 } : null,
    links: [],
    order: ['gaster', 'thorax', 'head'],
    ringed: ['thorax', 'head'],
    legs: splayedLegs(c, thY + 1, FRONT_LEGS, [2, 1, 0]),
    swing: [0, 1],
    antennaeBehind: [],
    // From the face, out past the gaster dome (nearer, so a little longer than top-down)
    antennaeFront: splayedAntennae(c, [CENTER - 1, hy - Math.ceil(ry) + 1], [-0.9, -0.8], [-0.6, -1], 3, 1),
    eyes: [[CENTER - ex, hy + ey], [mx(CENTER - ex), hy + ey]],
    eyeHeight: 2,
    rearEyes: [],
    mouth: c.shieldHead ? [] : [[CENTER - 1, by - 1], [CENTER + 1, by - 1]],
    jawsBehind: [],
    jaws: bothSides(jaw),
    drips: [[CENTER, by + 2], [CENTER, by + 3]],
    spines: rimSpines(c.spines.length),
    crest: [-1, 1, -2, 2, -3, 3],
    horn: c.horn ? [
      { points: [[CENTER - 1, hy], [CENTER + 1, hy]], tone: 3 },
      { points: [[CENTER, hy], [CENTER, hy + 1]], tone: 4 },
    ] : [],
    droplet: c.droplet ? [[CENTER, by], [CENTER, by + 1]] : [],
    wings: [{ base: [CENTER - 2, thY], dir: [-1, -0.6] }, { base: [CENTER + 2, thY], dir: [1, -0.6] }],
    load: { x: CENTER, y: hy + Math.ceil(ry) + 1, behind: false, rx: 1.4, ry: 1.8 },
    gasterGlow: -1,
    thoraxVisible: false,
  };
}

/**
 * Walking away: the gaster is nearest (lowest, painted last), the head
 * farthest and smallest; the antennae, a long-jawed caste's scythe tips and
 * a carried load peek out around it.
 */
function backPose(c: Readonly<SwarmCaste>): Pose {
  const gh = c.grx * 0.7;
  const gy = Math.floor(16.6 - gh); // its near rim just above the feet
  const thH = c.thRx * 0.6;
  // The thorax's back (its vein node) shows just above the gaster's rim
  const thY = gy - Math.floor(gh + 0.25) - 1;
  const rx = c.shieldHead ? 4 : c.hR;
  const ry = c.shieldHead ? 1.5 : c.hR * 0.85;
  const hy = Math.round(thY - thH - ry * 0.6);
  const scythe = c.jaws[0].points.length >= 5;
  const jx = CENTER - Math.ceil(rx) - 2; // just outside the head's outline
  return {
    axis: [0, -1],
    gaster: { x: CENTER, y: gy, along: gh, across: c.gry },
    dorsal: [0, 0],
    thorax: { x: CENTER, y: thY, rx: c.thRy + 0.3, ry: thH },
    head: { x: CENTER, y: hy, rx, ry },
    shield: c.shieldHead ? { x: CENTER - 4, y: hy - 1, w: 9, h: 3 } : null,
    links: [],
    order: ['head', 'thorax', 'gaster'],
    ringed: ['thorax', 'gaster'],
    legs: splayedLegs(c, thY + 1, BACK_LEGS, [0, 1, 2]),
    swing: [0, -1],
    // A V over the far head
    antennaeBehind: splayedAntennae(c, [CENTER - 1, hy - Math.ceil(ry)], [-0.35, -0.95], [-0.8, -0.6], 2, -1),
    antennaeFront: [],
    eyes: [],
    eyeHeight: 1,
    rearEyes: [[CENTER - Math.ceil(rx), hy], [mx(CENTER - Math.ceil(rx)), hy]],
    mouth: [],
    jawsBehind: scythe ? bothSides([{ points: [[jx, hy + 1], [jx, hy], [jx + 1, hy - 1]], tone: 4 }]) : [],
    jaws: [],
    drips: [],
    spines: rimSpines(c.spines.length),
    crest: [-1, 1, -2, 2, -3, 3],
    horn: [],
    droplet: [],
    wings: [{ base: [CENTER - 2, thY], dir: [-1, -0.6] }, { base: [CENTER + 2, thY], dir: [1, -0.6] }],
    load: { x: CENTER, y: Math.max(2, hy - Math.ceil(ry) - 1), behind: true, rx: 1.4, ry: 1.0 },
    gasterGlow: 0,
    thoraxVisible: true,
  };
}

const poseCache = new Map<AntRole, Record<PaintedView, Pose>>();

function posesFor(role: AntRole): Record<PaintedView, Pose> {
  let poses = poseCache.get(role);
  if (!poses) {
    const c = swarmCaste(role);
    poses = { front: frontPose(c), back: backPose(c), right: sidePose(c) };
    poseCache.set(role, poses);
  }
  return poses;
}

export interface StandingAntSpec {
  /** The caste (default: the worker). */
  role?: AntRole;
  view: StandingView;
  frame: number;
  /** A leaf chunk (true) or a cyan crystal chunk ('ore') held in the mandibles */
  carrying?: boolean | 'ore';
  /** The colony's mutation marks; only those the caste shows are drawn. */
  marks?: AntMarks;
}

/**
 * 24×24 art-pixel Swarm ant of one caste standing in one of the four views:
 * gaster, petiole, thorax, head, 6 elbowed legs, 2 elbowed antennae, the
 * glowing vein and eyes, pale jaws and bone spines, the caste's own features
 * and the marks it shows. No baked cast shadow: a standing ant gets its
 * ground shadow from the renderer, on the tilted ground.
 */
export function paintStandingAnt({ role = AntRole.Worker, view, frame, carrying = false, marks = NO_MARKS }: StandingAntSpec): ArtGrid {
  const c = swarmCaste(role);
  const shown = marksForRole(marks, role);
  const stacks = (id: AntMarkId): number => markStacks(shown, id);
  const pose = posesFor(role)[paintedView(view)];
  const F = PAL.swarm.flesh;
  return paintView(SPRITE_GRID.ant, view, p => paintPose(p, c, pose, frame, carrying, stacks), (p, grid, flip) => {
    // Screen-space light, after the mirror: top-left rim, sheen on gaster and head
    p.shade([F, PAL.leaf]);
    const g = gasterEllipse(pose, stacks('swollen_pale_gaster'));
    const near = pose.order[pose.order.length - 1];
    // (a gaster hidden behind the head gets its sheen on its visible upper rim)
    const gy = near === 'head' && pose.axis[1] > 0 ? g.y - 1 : g.y;
    p.sheen(flip(g.x), gy, Math.max(1, Math.round(Math.min(g.rx, g.ry) * 0.6)), F[4]);
    // Heads like the top-down rule: no sheen on a shield, a small head or a head plate
    // (and never over a glowing eye: facing left, the head's lit corner is its face)
    const [hx, hy] = [flip(pose.head.x) - 1, pose.head.y - 1];
    const lit = !c.shieldHead && c.hR >= 1.8 && stacks('thick_head_plate') === 0;
    if (lit && pose.eyes.length > 0 && !(PAL.swarm.vein as readonly string[]).includes(grid.get(hx, hy) ?? '')) p.sheen(flip(pose.head.x), pose.head.y, 1, F[4]);
  });
}

/** The gaster's screen ellipse; cargo sacs swell it across the body. */
function gasterEllipse(pose: Pose, sacs: number): Ellipse {
  const { x, y, along } = pose.gaster;
  const across = pose.gaster.across + 0.5 * sacs;
  return pose.axis[0] !== 0 ? { x, y, rx: along, ry: across } : { x, y, rx: across, ry: along };
}

/** Topmost row of an ellipse's fill in column `x` (null outside it). */
function ellipseTop(e: Ellipse, x: number): number | null {
  const t = (x - e.x) / (e.rx + 0.25);
  if (Math.abs(t) > 1) return null;
  return e.y - Math.floor((e.ry + 0.25) * Math.sqrt(1 - t * t));
}

function paintPose(p: ArtPen, c: Readonly<SwarmCaste>, pose: Pose, frame: number, carrying: boolean | 'ore', stacks: (id: AntMarkId) => number): void {
  const F = PAL.swarm.flesh;
  const V = PAL.swarm.vein;
  const O = PAL.swarm.outline;
  const [ux, uy] = pose.axis;
  const [wx, wy] = [Math.abs(uy), Math.abs(ux)]; // across the body
  const sacs = stacks('swollen_pale_gaster');
  const g = gasterEllipse(pose, sacs);
  const along = pose.axis[0] !== 0 ? g.rx : g.ry;
  const across = pose.axis[0] !== 0 ? g.ry : g.rx;
  const grid = p.grid;
  /** Gaster point `a` px toward the head and `c` px across from its dorsal centre. */
  const onGaster = (a: number, k: number): ArtPoint =>
    [Math.round(g.x + pose.dorsal[0] + ux * a + wx * k), Math.round(g.y + pose.dorsal[1] + uy * a + wy * k)];
  /** Paint only over the body (marks never spill past the silhouette). */
  const onBody = ([x, y]: ArtPoint, color: string): void => {
    if (grid.isBody(x, y)) p.px(x, y, color);
  };
  /** Gaster half-width (px across the body) at `a` px along it. */
  const gasterHalf = (a: number): number => {
    const t = a / (along + 0.25);
    return Math.abs(t) > 1 ? -1 : Math.floor((across + 0.25) * Math.sqrt(1 - t * t));
  };
  const band = (a: number, color: string): void => {
    const h = gasterHalf(a) - 1;
    if (h <= 0) return;
    for (let k = -h; k <= h; k++) onBody(onGaster(a, k), color);
  };
  const skin = sacs > 0 ? 'pale' : c.skin;
  const tones = skin === 'pale' ? [F[3], F[4], F[4]] : skin === 'plated' ? [F[1], F[2], F[3]] : [F[2], F[3], F[4]];
  const thoraxTone = skin === 'plated' ? F[1] : F[3];
  const linkTone = c.skin === 'pale' ? F[3] : F[2];
  const legTone = F[2]; // lighter than the top-down F[1], so legs read on dark ground

  const tips: ArtPoint[][] = [];
  for (const a of pose.antennaeBehind) {
    const pts = antennaPoints(a, frame);
    p.polyline(pts, F[a.tone]);
    tips.push(pts);
  }

  // Legs (behind the body), tripod gait like the top-down sprite
  const knees = paintLegs(p, pose.legs, frame, pose.swing, legTone, c.stout ? { center: CENTER } : null);
  const spurs = stacks('leg_spurs');
  for (const [kx, ky] of spurs > 0 ? knees : []) {
    p.px(kx, ky - 1, F[4]);
    if (spurs > 1) p.px(kx + (kx < CENTER ? -1 : 1), ky - 2, F[4]);
    if (spurs > 2) p.px(kx, ky + 1, F[4]);
  }

  const acid = stacks('chartreuse_jaws');
  const jawColor = (tone: number): string => (acid > 0 ? (tone >= 4 || acid > 2 ? V[1] : V[0]) : F[tone]);
  for (const jaw of pose.jawsBehind) p.polyline(jaw.points, jawColor(jaw.tone));

  // A load held behind the head (back view) is painted before the body
  const load = (): void => {
    const { x, y, rx, ry } = pose.load;
    if (carrying === 'ore') {
      const K = PAL.crystal.shell;
      p.outlined(pen => pen.poly([[x - 2, y - 2], [x + 1, y - 2], [x + 2, y], [x + 1, y + 2], [x - 2, y + 2], [x - 3, y]], K[3]), PAL.crystal.outline);
      p.line(x - 2, y - 1, x, y - 1, K[4]);
      p.line(x - 1, y + 1, x + 1, y + 1, K[1]);
    } else if (carrying) {
      p.outlined(pen => pen.ellipse(x, y, rx, ry, PAL.leaf[1]), O);
      if (rx > ry) p.hline(x - 1, y, 3, PAL.leaf[0]);
      else p.vline(x, y - 1, 3, PAL.leaf[0]);
    }
  };
  if (pose.load.behind) load();

  const th = pose.thorax;
  const hd = pose.head;
  const sh = pose.shield;
  const fill: Record<PartName, (pen: ArtPen) => void> = {
    gaster: pen => pen.ellipse(g.x, g.y, g.rx, g.ry, tones[0]),
    thorax: pen => pen.ellipse(th.x, th.y, th.rx, th.ry, thoraxTone),
    head: pen => (sh ? pen.rect(sh.x, sh.y, sh.w, sh.h, F[1]) : pen.ellipse(hd.x, hd.y, hd.rx, hd.ry, F[3])),
  };
  // Body silhouette as ONE outlined union (a clean waist pinch), far parts first
  p.outlined(pen => {
    for (const part of pose.order) {
      fill[part](pen);
      if (part === 'gaster') for (const [x, y] of pose.links) pen.px(x, y, linkTone);
    }
  }, O);

  const node: ArtPoint = [th.x + pose.dorsal[0], th.y + pose.dorsal[1] + (pose.axis[0] === 0 ? -1 : 0)];
  const half = Math.max(1, Math.floor(along - 0.5));
  const details: Record<PartName, () => void> = {
    gaster: () => {
      // Body tone inside the flanks, lit ridges either side of the vein
      p.ellipse(g.x, g.y, g.rx - 1, g.ry - 1, tones[1]);
      for (const k of [-1, 1]) {
        const [x0, y0] = onGaster(-1, k);
        const [x1, y1] = onGaster(1, k);
        p.line(x0, y0, x1, y1, tones[2]);
      }
      if (sacs > 0) for (const a of sacs > 2 ? [-2, 0, 2] : [-2, 2]) band(a, F[2]);
      const rings = stacks('dark_gaster_rings');
      if (rings > 0) for (const a of [[-1, 1], [-2, 0, 2], [-3, -1, 1, 3]][rings - 1]) band(a, F[0]);

      const stitches = stacks('pink_stitches');
      const wound = (a0: number, n: number, k: number): void => {
        for (let i = 0; i < n; i++) {
          for (const dk of [0, 1]) onBody(onGaster(a0 + i, k + dk), F[0]);
          onBody(onGaster(a0 + i, k + (i % 2)), F[4]);
        }
      };
      if (stitches > 0) wound(-2, Math.min(5, Math.round(along * 2)), -2);
      if (stitches > 1) wound(-1, Math.min(4, Math.round(along * 2) - 1), 1);

      // The glowing vein down the gaster's back; plated defenders show it only between plates
      if (skin === 'plated') {
        for (const a of [-2, 2]) {
          band(a, F[0]);
          const h = gasterHalf(a) - 1;
          if (h > 0) for (const k of [-h, h]) onBody(onGaster(a, k), F[3]);
        }
        onBody(onGaster(-1, 0), V[0]);
        onBody(onGaster(0, 0), V[1]);
        onBody(onGaster(1, 0), V[0]);
      } else {
        const [x0, y0] = onGaster(-half, 0);
        const [x1, y1] = onGaster(half, 0);
        // Pale nurse skin is thin: the vein shows through it dimmer, brightest at the core
        p.line(x0, y0, x1, y1, c.skin === 'pale' ? V[0] : V[1]);
        p.px(x0, y0, V[0]);
        p.px(x1, y1, V[0]);
        onBody(onGaster(pose.gasterGlow, 0), V[1]);
        onBody(onGaster(0, 0), V[1]);
      }

      // Toxic glands: blotches of vein light through the taut gaster, a hot core in each
      if (c.volatile) {
        for (const [a, k] of [[-2, -2], [1, -2], [-1, 1], [2, 1]] as const) {
          for (const [da, dk] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) onBody(onGaster(a + da, k + dk), V[0]);
          onBody(onGaster(a, k), V[1]);
        }
        onBody(onGaster(0, 0), V[1]);
      }

      const surge = stacks('pulsing_vein');
      if (surge > 0) {
        const side = surge > 2 ? V[1] : V[0];
        for (const k of [-1, 1]) {
          const [x1, y1] = onGaster(-1, k);
          const [x2, y2] = onGaster(1, k);
          p.line(x1, y1, x2, y2, side);
        }
        if (surge > 1) for (const a of [-2, 2]) if (gasterHalf(a) >= 2) for (const k of [-2, 2]) onBody(onGaster(a, k), side);
      }
      const spores = stacks('thorax_pustules');
      if (spores > 2) {
        const [x, y] = onGaster(1, -1);
        onBody([x, y], F[4]);
        onBody([x, y - 1], V[0]);
      }
      const chitin = stacks('chitin_plates');
      if (chitin > 1) for (const k of [-1, 1]) onBody(onGaster(Math.round(along) - 1, k), F[0]);
      const venom = stacks('venom_sac');
      if (venom > 0) {
        const tail = Math.round(along);
        onBody(onGaster(-tail, 0), PAL.acid[2]);
        if (venom > 1) for (const k of [-1, 1]) onBody(onGaster(-tail + 1, k), PAL.acid[1]);
        if (venom > 2) p.px(...onGaster(-tail - 1, 0), PAL.acid[3]);
      }
      // Brood frenzy: glowing nodes along the nurse's gaster
      const brood = stacks('brood_nodes');
      for (let i = 0; i < brood; i++) for (const k of [-1, 1]) onBody(onGaster(-1 + i, k), V[1]);
      // Sentinel spines: a crest of pale spikes along the upper rim, more per stack
      const crest = stacks('dorsal_spines');
      for (const t of pose.crest.slice(0, crest * 2)) {
        const y = ellipseTop(g, g.x + t);
        if (y !== null) onBody([g.x + t, y], F[4]);
      }
      // 1-px bone spines just outside the gaster outline
      for (const t of pose.spines) {
        const y = ellipseTop(g, g.x + t);
        if (y !== null) p.px(g.x + t, y - 2, F[3]);
      }
    },
    thorax: () => {
      if (skin === 'plated' && c.thRy >= 2) p.ellipse(th.x, th.y, th.rx - 1, th.ry - 1, F[2]);
      // (from the front the head hides the thorax's vein node)
      if (pose.thoraxVisible) {
        p.px(node[0], node[1], V[1]);
        p.px(node[0] - ux, node[1] - uy, V[0]);
      }
      const surge = stacks('pulsing_vein');
      if (surge > 0) p.line(node[0], node[1], hd.x + pose.dorsal[0] - ux, hd.y + pose.dorsal[1] - uy, V[1]);
      // Spore bloom: blisters on the thorax's back, spore motes above it
      const spores = stacks('thorax_pustules');
      const thTop = Math.round(th.y - th.ry);
      if (spores > 0) {
        p.px(th.x - 1, thTop, F[4]);
        p.px(th.x + 1, thTop, F[4]);
        p.px(th.x, thTop - 1, F[3]);
        p.px(th.x - 1, thTop - 3, F[4]);
      }
      if (spores > 1) p.px(th.x + 2, thTop - 4, F[3]);
      const chitin = stacks('chitin_plates');
      if (chitin > 0) p.line(node[0] - wx, node[1] - wy, node[0] + wx, node[1] + wy, F[0]);
      if (chitin > 2) p.px(node[0] + ux, node[1] + uy, F[4]);
      // Royal shell: the queen's gold sigil worn on the thorax
      const sigil = stacks('royal_sigil');
      if (sigil > 0) p.px(node[0], node[1], PAL.queen);
      if (sigil > 1) for (const k of [-1, 1]) p.px(node[0] + wx * k, node[1] + wy * k, PAL.queen);
      if (sigil > 2) for (const k of [-1, 1]) p.px(node[0] - ux + wx * k, node[1] - uy + wy * k, PAL.legionCrown);
      // Wing stubs: atrophied membrane wings swept back from the thorax, longer per stack
      const wings = stacks('wing_stubs');
      if (wings > 0) {
        const n = 2 + wings;
        for (const { base, dir } of pose.wings) {
          const tip: ArtPoint = [base[0] + Math.round(dir[0] * n), base[1] + Math.round(dir[1] * n)];
          p.outlined(pen => pen.capsule(base[0], base[1], tip[0], tip[1], 0.7, F[4]), O);
          p.line(base[0], base[1], tip[0], tip[1], F[3]);
          if (wings > 2) {
            const b2: ArtPoint = [base[0] - Math.sign(dir[0]) * 1, base[1] + 1];
            p.outlined(pen => pen.capsule(b2[0], b2[1], b2[0] + Math.round(dir[0] * 2), b2[1] + Math.round(dir[1] * 2) + 1, 0.5, F[4]), O);
          }
        }
      }
    },
    head: () => {
      if (sh) {
        // Shield head: a dark armor rim around a raised plate with a lit ridge
        p.rect(sh.x + 1, sh.y + 1, sh.w - 2, sh.h - 2, F[2]);
        if (sh.w > sh.h) p.hline(sh.x + 2, sh.y + Math.floor(sh.h / 2), sh.w - 4, F[3]);
        else p.vline(sh.x + Math.floor(sh.w / 2), sh.y + 1, sh.h - 2, F[3]);
      }
      // Titan brood: a thick, knobbed armor plate over the soldier's head
      const plate = stacks('thick_head_plate');
      if (plate > 0 && !sh) {
        p.ellipse(hd.x, hd.y, hd.rx - 0.5, hd.ry - 0.5, F[1]);
        p.ellipse(hd.x, hd.y, hd.rx - 1.5, hd.ry - 1.5, F[3]);
        for (const k of [-2, 2]) onBody([hd.x + k, hd.y - 1], F[4]);
        if (plate > 1) onBody([hd.x, Math.round(hd.y - hd.ry)], F[4]);
        if (plate > 2) for (const k of [-1, 1]) onBody([hd.x + k, Math.round(hd.y - hd.ry) + 1], F[4]);
      }
      const stitches = stacks('pink_stitches');
      if (stitches > 2) {
        p.line(hd.x - 1, hd.y - 1, hd.x + 1, hd.y + 1, F[0]);
        p.px(hd.x - 1, hd.y + 1, F[4]);
        p.px(hd.x + 1, hd.y - 1, F[4]);
      }
      // Glowing eyes on the head flanks (none seen from behind)
      const eyes = stacks('compound_eyes');
      if (pose.mouth.length > 0) p.line(pose.mouth[0][0], pose.mouth[0][1], pose.mouth[1][0], pose.mouth[1][1], F[1]);
      for (const [ex, ey] of pose.eyes) {
        for (let k = 1; k < pose.eyeHeight; k++) p.px(ex, ey - k, eyes > 0 ? PAL.acid[2] : V[1]);
        p.px(ex, ey, eyes > 0 ? PAL.acid[3] : V[1]);
        if (eyes > 1) p.px(ex, ey - 1, PAL.acid[2]);
        if (eyes > 2) p.px(ex + (ex < hd.x ? 1 : ex > hd.x ? -1 : 1), ey - 1, PAL.acid[2]);
      }
      if (eyes > 0) for (const [ex, ey] of pose.rearEyes) p.px(ex, ey, eyes > 1 ? PAL.acid[2] : PAL.acid[1]);
      // The defender's horn juts out of the shield's front
      for (const h of pose.horn) p.polyline(h.points, F[h.tone]);
    },
  };

  pose.order.forEach(part => {
    if (pose.ringed.includes(part)) p.outlined(fill[part], O);
    details[part]();
  });

  // Load in front of the face, gripped by the mandibles
  if (!pose.load.behind) load();
  for (const jaw of pose.jaws) p.polyline(jaw.points, jawColor(jaw.tone));
  if (acid > 1 && pose.drips[0]) p.px(...pose.drips[0], V[0]);
  if (acid > 2 && pose.drips[1]) p.px(...pose.drips[1], V[1]);
  // Nurse: a pale nectar droplet held between the jaws for the brood
  if (!carrying) for (const [x, y] of pose.droplet) p.px(x, y, F[4]);

  for (const a of pose.antennaeFront) {
    const pts = antennaPoints(a, frame);
    p.polyline(pts, F[a.tone]);
    tips.push(pts);
  }
  const mind = stacks('glowing_antenna_tips');
  for (const [, elbow, tip] of tips) {
    if (mind > 1) {
      const bx = Math.round(tip[0] + (elbow[0] - tip[0]) * 0.34);
      const by = Math.round(tip[1] + (elbow[1] - tip[1]) * 0.34);
      p.line(tip[0], tip[1], bx, by, V[0]);
    }
    if (mind > 2) p.px(elbow[0], elbow[1], V[0]);
    if (mind > 0) p.px(tip[0], tip[1], V[1]);
  }
}

const glowCache = new Map<string, readonly AntGlowPoint[]>();

/**
 * Where a standing caste's vein and eyes sit on a view, in world px from
 * the sprite pivot (`along` = screen x, `across` = screen y; the view is
 * never turned): gaster vein, thorax node, then the eyes it shows.
 */
export function standingAntGlowPoints(view: StandingView, role: AntRole = AntRole.Worker): readonly AntGlowPoint[] {
  const key = `${role}|${view}`;
  const cached = glowCache.get(key);
  if (cached) return cached;
  const pose = posesFor(role)[paintedView(view)];
  const flip = view === 'left' ? mx : (x: number) => x;
  const pivot = spritePivot(SPRITE_GRID.ant);
  const at = ([x, y]: ArtPoint): AntGlowPoint => ({ along: (flip(x) + 0.5 - pivot) * ART_PX, across: (y + 0.5 - pivot) * ART_PX });
  const [ux, uy] = pose.axis;
  const g = pose.gaster;
  const th = pose.thorax;
  const points = [
    at([g.x + pose.dorsal[0] + ux * pose.gasterGlow, g.y + pose.dorsal[1] + uy * pose.gasterGlow]),
    ...(pose.thoraxVisible ? [at([th.x + pose.dorsal[0], th.y + pose.dorsal[1] + (ux === 0 ? -1 : 0)])] : []),
    ...pose.eyes.map(at),
  ];
  glowCache.set(key, points);
  return points;
}
