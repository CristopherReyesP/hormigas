// The Swarm (player faction) sprite recipes: castes on the 24×24 ant grid and
// the brood queen on her own big grid. Authored facing right; ArtPen turns
// them to each of the 16 baked directions and lights them from the top-left.
import { AntRole } from '../../../game/components/components';
import { ArtGrid } from '../pixelart/ArtGrid';
import { ArtPen, type ArtPoint } from '../pixelart/ArtPen';
import { directionAngle } from '../pixelart/directions';
import { PAL } from '../pixelart/palette';
import { ART_PX, SPRITE_GRID, spritePivot } from './spriteScale';

// Tripod-gait swing offsets (art px) for the 4-frame walk cycle.
const GAIT = [1, 0, -1, 0];

/** Body axis row of the ant grid; painters mirror upper-half points about it. */
const AXIS = Math.floor(SPRITE_GRID.ant / 2);

/** One mandible stroke (upper half, mirrored): a polyline in one flesh tone. */
interface JawStroke {
  points: readonly ArtPoint[];
  tone: number;
}

/**
 * Swarm caste anatomy on the 24×24 ant grid (facing right, body axis y = 12).
 * Castes differ by SILHOUETTE — head size, jaw shape, leg reach, spines —
 * plus tone shifts inside the one flesh ramp, never by a foreign accent color.
 * Every point stays within 11 art px of the pivot so no direction clips it.
 */
interface SwarmCaste {
  gx: number; grx: number; gry: number;      // gaster centre x + radii
  skin: 'flesh' | 'pale' | 'plated';         // gaster finish
  petiole: readonly number[];                // waist pixels on the axis
  thCx: number; thRx: number; thRy: number;  // thorax
  neck: number | null;
  hX: number; hR: number; shieldHead?: boolean;
  hips: readonly [number, number, number]; reach: number; splay: number;
  antenna: readonly [ArtPoint, ArtPoint, ArtPoint]; // root → elbow → tip (tip flicks)
  spines: readonly ArtPoint[];               // 1-px bone bumps just outside the outline
  jaws: readonly JawStroke[];                // scythe mandibles (unoutlined, stay sharp)
  eye: ArtPoint;
  mouth: number;                             // x where a carried leaf is held
}

const SWARM_CASTES: Record<AntRole, SwarmCaste> = {
  // Drone: the baseline body plan, short hooked scythes, one spine pair
  [AntRole.Worker]: {
    gx: 6, grx: 3.6, gry: 2.9, skin: 'flesh', petiole: [10, 11],
    thCx: 13, thRx: 1.6, thRy: 1.3, neck: 15, hX: 17, hR: 2.0,
    hips: [12, 13, 14], reach: 6, splay: 4,
    antenna: [[18, 10], [19, 8], [21, 6]], spines: [[5, 7]],
    jaws: [{ points: [[19, 10], [20, 10], [21, 11]], tone: 4 }],
    eye: [17, 10], mouth: 20,
  },
  // Slasher: small gaster, huge head, long curved scythes, stocky legs
  [AntRole.Soldier]: {
    gx: 5, grx: 2.7, gry: 2.4, skin: 'flesh', petiole: [9],
    thCx: 11, thRx: 1.6, thRy: 1.4, neck: 13, hX: 16, hR: 3.0,
    hips: [10, 11, 12], reach: 5, splay: 3,
    antenna: [[16, 8], [17, 6], [19, 5]], spines: [[4, 8]],
    jaws: [
      { points: [[19, 10], [20, 9], [21, 9], [22, 10], [22, 11]], tone: 4 },
      { points: [[20, 10], [21, 10]], tone: 3 },
    ],
    eye: [17, 9], mouth: 20,
  },
  // Scout: sleek and spineless — slimmest gaster, longest legs and antennae
  [AntRole.Scout]: {
    gx: 7, grx: 3.4, gry: 1.7, skin: 'flesh', petiole: [11, 12],
    thCx: 14, thRx: 1.4, thRy: 1.0, neck: 16, hX: 18, hR: 1.4,
    hips: [13, 14, 15], reach: 7, splay: 4,
    antenna: [[18, 10], [17, 7], [19, 4]], spines: [],
    jaws: [{ points: [[20, 11], [21, 11]], tone: 4 }],
    eye: [18, 11], mouth: 20,
  },
  // Nurse: soft, pale brood-tender — round gaster, small head, short legs
  [AntRole.Nurse]: {
    gx: 6, grx: 3.4, gry: 3.2, skin: 'pale', petiole: [10],
    thCx: 12, thRx: 1.3, thRy: 1.2, neck: 14, hX: 16, hR: 1.6,
    hips: [11, 12, 13], reach: 5, splay: 2,
    antenna: [[16, 10], [17, 8], [19, 7]], spines: [],
    jaws: [{ points: [[18, 11], [19, 11]], tone: 4 }],
    eye: [16, 11], mouth: 18,
  },
  // Armored: dark plated gaster, square shield head, blunt jaws, spine rows + horn
  [AntRole.Defender]: {
    gx: 6, grx: 3.6, gry: 2.9, skin: 'plated', petiole: [10, 11],
    thCx: 13, thRx: 1.9, thRy: 1.5, neck: null, hX: 18, hR: 1.8, shieldHead: true,
    hips: [12, 13, 14], reach: 5, splay: 2,
    antenna: [[18, 8], [19, 6], [21, 6]], spines: [[4, 7], [6, 7], [8, 7], [13, 9]],
    jaws: [{ points: [[20, 10], [21, 10]], tone: 3 }],
    eye: [18, 10], mouth: 20,
  },
};

export interface AntSpriteSpec {
  role: AntRole;
  frame: number;
  direction: number;
  carrying?: boolean;
  /** Dithered ground shadow under the silhouette (off for UI previews that draw their own). */
  shadow?: boolean;
}

/**
 * 24×24 art-pixel Swarm ant in one of the 16 directions. The ant body plan is
 * intact — bulbous gaster, petiole (waist), thorax, head, 6 elbowed legs, 2
 * elbowed antennae — but mutated: magenta flesh, a glowing chartreuse vein
 * down the body axis, glowing eyes, pale scythe mandibles and 1-px bone
 * spines. Interior shading is symmetric about the axis; the top-left rim
 * light, the sheen and the shadow are added in screen space after the turn.
 */
export function paintAnt({ role, frame, direction, carrying = false, shadow = true }: AntSpriteSpec): ArtGrid {
  const grid = new ArtGrid(SPRITE_GRID.ant);
  const p = new ArtPen(grid, directionAngle(direction));
  const c = SWARM_CASTES[role];
  const F = PAL.swarm.flesh;
  const V = PAL.swarm.vein;
  const O = PAL.swarm.outline;
  const swing = GAIT[frame % GAIT.length];
  const flick = frame % 2;
  const mirror = (y: number): number => 2 * AXIS - y;
  const mirrored = (pts: readonly ArtPoint[]): ArtPoint[] => pts.map(([x, y]) => [x, mirror(y)] as const);

  // Gaster finish: [flank, body, ridge]
  const tones =
    c.skin === 'pale' ? [F[3], F[4], F[4]] :
    c.skin === 'plated' ? [F[1], F[2], F[3]] :
    [F[2], F[3], F[4]];

  // Legs (behind the body), tripod gait: front + back of one side move with
  // the middle leg of the other side. Elbowed: femur out, tibia to the foot.
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 3; i++) {
      const groupA = (i + (side === 1 ? 1 : 0)) % 2 === 0;
      const s = groupA ? swing : -swing;
      const hipX = c.hips[i];
      const footX = hipX + (i - 1) * c.splay + s;
      const kneeX = Math.round(hipX + (footX - hipX) * 0.45);
      // Dark flesh, not outline black, so the legs read on dark regolith
      p.polyline([
        [hipX, AXIS + side],
        [kneeX, AXIS + side * Math.round(c.reach * 0.7)],
        [footX, AXIS + side * c.reach],
      ], F[1]);
    }
  }

  // Body silhouette as ONE outlined union so the waist pinch gets a clean,
  // continuous 1-px outline: gaster + petiole + thorax + neck + head.
  p.outlined(pen => {
    pen.ellipse(c.gx, AXIS, c.grx, c.gry, tones[0]);
    for (const x of c.petiole) pen.px(x, AXIS, F[2]);
    pen.ellipse(c.thCx, AXIS, c.thRx, c.thRy, c.skin === 'plated' ? F[2] : F[3]);
    if (c.neck !== null) pen.px(c.neck, AXIS, F[2]);
    if (c.shieldHead) pen.rect(c.hX - 2, AXIS - 3, 4, 7, F[2]);
    else pen.disc(c.hX, AXIS, c.hR, F[3]);
  }, O);

  // Gaster: body tone inside the flanks, lit ridges on both sides of the vein
  p.ellipse(c.gx, AXIS, c.grx - 1, c.gry - 1, tones[1]);
  p.hline(c.gx - 1, AXIS - 1, 3, tones[2]);
  p.hline(c.gx - 1, mirror(AXIS - 1), 3, tones[2]);

  // The glowing vein: bright core along the body axis, dim tips, thorax node.
  // Plated defenders show it only between their armor plates.
  if (c.skin === 'plated') {
    for (const sx of [c.gx - 2, c.gx + 2]) {
      p.vline(sx, AXIS - 2, 5, F[0]);
      p.px(sx, AXIS - 3, F[3]);
      p.px(sx, mirror(AXIS - 3), F[3]);
    }
    p.px(c.gx - 1, AXIS, V[0]);
    p.px(c.gx, AXIS, V[1]);
    p.px(c.gx + 1, AXIS, V[0]);
  } else {
    const half = Math.floor(c.grx - 0.5);
    p.hline(c.gx - half, AXIS, half * 2 + 1, V[1]);
    p.px(c.gx - half, AXIS, V[0]);
    p.px(c.gx + half, AXIS, V[0]);
  }
  p.px(c.thCx, AXIS, V[1]);
  p.px(c.thCx - 1, AXIS, V[0]);

  // Shield head: the lit front plate
  if (c.shieldHead) {
    p.vline(c.hX, AXIS - 2, 5, F[3]);
    p.px(c.hX - 1, AXIS, F[3]);
  }

  // Glowing eyes on the head flanks
  p.px(c.eye[0], c.eye[1], V[1]);
  p.px(c.eye[0], mirror(c.eye[1]), V[1]);

  // 1-px bone spines on the silhouette edge
  for (const [sx, sy] of c.spines) {
    p.px(sx, sy, F[3]);
    p.px(sx, mirror(sy), F[3]);
  }

  // Carrying: a leaf chunk held in the mandibles, ahead of the head
  if (carrying) {
    p.outlined(pen => pen.ellipse(c.mouth, AXIS, 1.2, 1.8, PAL.leaf[1]), O);
    p.vline(c.mouth, AXIS - 1, 3, PAL.leaf[0]);
  }

  // Scythe mandibles (pale bone, unoutlined so the hooks stay 1 px sharp)
  for (const jaw of c.jaws) {
    p.polyline(jaw.points, F[jaw.tone]);
    p.polyline(mirrored(jaw.points), F[jaw.tone]);
  }

  // Elbowed antennae that flick across frames (the scout's are longest)
  // (mirroring the flicked tip flicks the lower antenna the other way)
  const [root, elbow, tip] = c.antenna;
  const antenna: ArtPoint[] = [root, elbow, [tip[0], tip[1] + flick]];
  p.polyline(antenna, F[2]);
  p.polyline(mirrored(antenna), F[2]);

  // Screen-space light: top-left rim, sheen on the gaster and head, cast shadow
  p.shade([F, PAL.leaf]);
  p.sheen(c.gx, AXIS, Math.max(1, Math.round(Math.min(c.grx, c.gry) * 0.6)), F[4]);
  if (!c.shieldHead && c.hR >= 1.8) p.sheen(c.hX, AXIS, 1, F[4]);
  if (shadow) p.castShadow(O, 1, 2);
  return grid;
}

/** A glowing spot on an ant sprite, in world px relative to its rotation origin. */
export interface AntGlowPoint {
  along: number; // + toward the head
  across: number; // + toward the sprite's lower half (before rotation)
}

const antGlowCache = new Map<AntRole, readonly AntGlowPoint[]>();

/**
 * Where an ant's vein and eyes sit on its sprite: gaster vein core, thorax
 * node, then both eyes. Derived from SWARM_CASTES so the night glow pass
 * stays on the vein if the anatomy or the art scale changes.
 */
export function antGlowPoints(role: AntRole): readonly AntGlowPoint[] {
  const cached = antGlowCache.get(role);
  if (cached) return cached;
  const c = SWARM_CASTES[role];
  const pivot = spritePivot(SPRITE_GRID.ant);
  const toSprite = (artPx: number) => (artPx + 0.5 - pivot) * ART_PX;
  const points: AntGlowPoint[] = [
    { along: toSprite(c.gx), across: toSprite(AXIS) },
    { along: toSprite(c.thCx), across: toSprite(AXIS) },
    { along: toSprite(c.eye[0]), across: toSprite(c.eye[1]) },
    { along: toSprite(c.eye[0]), across: toSprite(2 * AXIS - c.eye[1]) },
  ];
  antGlowCache.set(role, points);
  return points;
}

// ─── Brood queen ───────────────────────────────────────────

const QUEEN_AXIS = Math.floor(SPRITE_GRID.queen / 2);

export interface QueenSpriteSpec {
  frame: number;
  direction: number;
  /** The breathing step: the egg sac swells by one art pixel. */
  swollen?: boolean;
  /** Dithered ground shadow under the silhouette. */
  shadow?: boolean;
}

/**
 * The Swarm queen on her own 52×52 grid (2 world px per art px, like every
 * unit): a bloated, banded egg sac with the colony's densest vein network,
 * eggs glowing through the stretched skin, a small head with short scythes
 * and compact 2-px legs. RenderSystem adds her halo and crest.
 */
export function paintQueen({ frame, direction, swollen = false, shadow = true }: QueenSpriteSpec): ArtGrid {
  const grid = new ArtGrid(SPRITE_GRID.queen);
  const p = new ArtPen(grid, directionAngle(direction));
  const F = PAL.swarm.flesh;
  const V = PAL.swarm.vein;
  const O = PAL.swarm.outline;
  const A = QUEEN_AXIS;
  const swing = GAIT[frame % GAIT.length];
  const flick = frame % 2;
  const mirror = (y: number): number => 2 * A - y;

  const grow = swollen ? 1 : 0;
  const gx = 17;
  const grx = 11.5 + grow;
  const gry = 10 + grow;
  const thCx = 35;
  const hX = 42;

  // Compact 2-px legs on the thorax
  const hips = [33, 35, 37];
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 3; i++) {
      const groupA = (i + (side === 1 ? 1 : 0)) % 2 === 0;
      const s = (groupA ? swing : -swing) * 2;
      const hipX = hips[i];
      const footX = hipX + (i - 1) * 4 + s;
      const kneeX = Math.round(hipX + (footX - hipX) * 0.5);
      p.capsule(hipX, A + side * 2, kneeX, A + side * 6, 0.5, O);
      p.capsule(kneeX, A + side * 6, footX, A + side * 9, 0.5, O);
    }
  }

  // Body union: egg sac + petiole + thorax + neck + head
  p.outlined(pen => {
    pen.ellipse(gx, A, grx, gry, F[1]);
    pen.rect(29, A - 1, 3, 3, F[1]);
    pen.ellipse(thCx, A, 3.4, 2.8, F[2]);
    pen.rect(39, A - 1, 1, 3, F[2]);
    pen.disc(hX, A, 3.6, F[3]);
  }, O);

  // Sac shading: dark flanks → body → lit core along the vein
  p.ellipse(gx, A, grx - 2, gry - 2, F[2]);
  p.ellipse(gx + 0.5, A, grx - 5, gry - 4.5, F[3]);

  // Banded segments (tergites) bowing toward the tail
  for (const bx of [8, 13, 18, 23]) {
    const t = (bx - gx) / (grx + 0.25);
    const hh = Math.floor(gry * Math.sqrt(Math.max(0, 1 - t * t))) - 1;
    if (hh < 2) continue;
    const bow = Math.round(hh / 4);
    p.polyline([[bx + bow, A - hh], [bx, A - Math.round(hh / 2)], [bx, mirror(A - Math.round(hh / 2))], [bx + bow, mirror(A - hh)]], F[1]);
  }

  // Vein network: a bright spine with fishbone tributaries swept toward the tail
  p.hline(gx - 10, A, 21, V[1]);
  p.px(gx - 10, A, V[0]);
  p.px(gx + 10, A, V[0]);
  for (const tx of [gx - 6, gx - 2, gx + 2, gx + 6]) {
    for (const sy of [-1, 1]) {
      p.line(tx, A + sy, tx - 2, A + sy * 4, V[1]);
      p.line(tx - 2, A + sy * 4, tx - 4, A + sy * 7, V[0]);
    }
  }
  // Eggs glowing through the stretched skin, between the tributaries
  for (const ex of [gx - 5, gx - 1, gx + 3]) {
    for (const sy of [-1, 1]) p.rect(ex, sy < 0 ? A - 6 : A + 5, 2, 2, F[4]);
  }

  // Thorax node and the waist vein
  p.hline(thCx - 2, A, 5, V[0]);
  p.px(thCx, A, V[1]);
  p.px(30, A, V[0]);

  // Head: glowing eyes, short scythes
  for (const ex of [43, 44]) {
    p.px(ex, 23, V[1]);
    p.px(ex, mirror(23), V[1]);
  }
  p.polyline([[46, 24], [47, 24], [48, 25]], F[4]);
  p.polyline([[46, mirror(24)], [47, mirror(24)], [48, mirror(25)]], F[4]);

  // Elbowed antennae
  p.polyline([[43, 22], [44, 18], [47, 15 + flick]], F[3]);
  p.polyline([[43, mirror(22)], [44, mirror(18)], [47, mirror(15 + flick)]], F[3]);

  p.shade([F]);
  p.sheen(gx, A, 5, F[4]);
  p.sheen(gx, A, 4, F[4]);
  p.sheen(hX, A, 2, F[4]);
  if (shadow) p.castShadow(O, 1, 2);
  return grid;
}
