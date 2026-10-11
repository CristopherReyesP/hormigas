// The Swarm (player faction) sprite recipes: castes on the 24×24 ant grid and
// the brood queen on her own big grid. Authored facing right; ArtPen turns
// them to each of the 16 baked directions and lights them from the top-left.
import { AntRole } from '../../../game/components/components';
import { ArtGrid } from '../pixelart/ArtGrid';
import { ArtPen, type ArtPoint } from '../pixelart/ArtPen';
import { directionAngle } from '../pixelart/directions';
import { PAL } from '../pixelart/palette';
import { ART_PX, SPRITE_GRID, spritePivot } from './spriteScale';
import { NO_MARKS, markStacks, marksForRole, type AntMarkId, type AntMarks } from './antMarks';

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
  hX: number; hR: number;
  shieldHead?: boolean;                      // broad 5×9 head plate instead of a round head
  horn?: boolean;                            // pale horn jutting from the shield's front
  hips: readonly [number, number, number]; reach: number; splay: number;
  stout?: boolean;                           // 2-px thick legs
  droplet?: boolean;                         // nectar droplet held between the jaws
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
  // Scout: sleek and spineless — a long narrow gaster, longest legs and antennae
  [AntRole.Scout]: {
    gx: 7, grx: 3.6, gry: 2.2, skin: 'flesh', petiole: [11, 12],
    thCx: 14, thRx: 1.4, thRy: 1.0, neck: 16, hX: 18, hR: 1.4,
    hips: [13, 14, 15], reach: 7, splay: 4,
    antenna: [[18, 10], [17, 7], [19, 4]], spines: [],
    jaws: [{ points: [[20, 11], [21, 11]], tone: 4 }],
    eye: [18, 11], mouth: 20,
  },
  // Nurse: the slim, delicate brood-tender — a small pale egg-shaped gaster
  // (the vein shows through the thin skin), a long thread waist, a narrow
  // body, long thin legs and antennae, and a nectar droplet between the jaws
  [AntRole.Nurse]: {
    gx: 6, grx: 2.6, gry: 1.2, skin: 'pale', petiole: [9, 10, 11],
    thCx: 13, thRx: 1.2, thRy: 0.7, neck: 15, hX: 17, hR: 1.1,
    hips: [12, 13, 14], reach: 7, splay: 3,
    antenna: [[17, 11], [18, 8], [21, 6]], spines: [],
    jaws: [{ points: [[19, 11], [20, 11]], tone: 4 }],
    eye: [17, 11], mouth: 20, droplet: true,
  },
  // Armored: the colony's wall — a broad shield-plated head with a dark rim
  // and a forward horn, a thick plated thorax, a heavy plated gaster, short
  // stout legs, blunt jaws and spine rows
  [AntRole.Defender]: {
    gx: 6, grx: 3.6, gry: 3.2, skin: 'plated', petiole: [10],
    thCx: 12.5, thRx: 1.9, thRy: 2.2, neck: null, hX: 17, hR: 2.0, shieldHead: true, horn: true,
    hips: [10, 11, 12], reach: 5, splay: 2, stout: true,
    antenna: [[18, 8], [19, 6], [21, 6]], spines: [[4, 7], [6, 7], [8, 7]],
    jaws: [{ points: [[20, 10]], tone: 3 }],
    eye: [18, 9], mouth: 20,
  },
};

export interface AntSpriteSpec {
  role: AntRole;
  frame: number;
  direction: number;
  /** A leaf chunk (true) or, for a miner, a cyan crystal chunk ('ore') in the mandibles */
  carrying?: boolean | 'ore';
  /** Dithered ground shadow under the silhouette (off for UI previews that draw their own). */
  shadow?: boolean;
  /** The colony's mutation marks; only those this caste shows are drawn. */
  marks?: AntMarks;
}

/**
 * 24×24 art-pixel Swarm ant in one of the 16 directions. The ant body plan is
 * intact — bulbous gaster, petiole (waist), thorax, head, 6 elbowed legs, 2
 * elbowed antennae — but mutated: magenta flesh, a glowing chartreuse vein
 * down the body axis, glowing eyes, pale scythe mandibles and 1-px bone
 * spines. Interior shading is symmetric about the axis; the top-left rim
 * light, the sheen and the shadow are added in screen space after the turn.
 *
 * Mutation marks (`marks`) are painted into the same recipe, so they turn
 * and light with the body and stack in a fixed order: body shape first
 * (cargo sacs), then surface marks (rings, stitches, vein, pustules, plate),
 * then appendages (wings, spurs, jaws, antenna tips).
 */
export function paintAnt({ role, frame, direction, carrying = false, shadow = true, marks = NO_MARKS }: AntSpriteSpec): ArtGrid {
  const grid = new ArtGrid(SPRITE_GRID.ant);
  const p = new ArtPen(grid, directionAngle(direction));
  const c = SWARM_CASTES[role];
  const shown = marksForRole(marks, role);
  const stacks = (id: AntMarkId): number => markStacks(shown, id);
  const F = PAL.swarm.flesh;
  const V = PAL.swarm.vein;
  const O = PAL.swarm.outline;
  const swing = GAIT[frame % GAIT.length];
  const flick = frame % 2;
  const mirror = (y: number): number => 2 * AXIS - y;
  const mirrored = (pts: readonly ArtPoint[]): ArtPoint[] => pts.map(([x, y]) => [x, mirror(y)] as const);
  const both = (x: number, y: number, color: string): void => {
    p.px(x, y, color);
    p.px(x, mirror(y), color);
  };

  // Cargo sacs: a swollen, pale, stretched gaster (one size step per stack)
  const sacs = stacks('swollen_pale_gaster');
  const grx = c.grx; // it swells sideways only: lengthwise it would leave the rotation-safe circle
  const gry = c.gry + 0.5 * sacs;
  const skin = sacs > 0 ? 'pale' : c.skin;
  /** Rows above the axis that the gaster covers in column x (-1 outside it). */
  const gasterHalf = (x: number): number => {
    const t = (x - c.gx) / (grx + 0.25);
    return Math.abs(t) > 1 ? -1 : Math.floor((gry + 0.25) * Math.sqrt(1 - t * t));
  };

  // Gaster finish: [flank, body, ridge]
  const tones =
    skin === 'pale' ? [F[3], F[4], F[4]] :
    skin === 'plated' ? [F[1], F[2], F[3]] :
    [F[2], F[3], F[4]];

  // Legs (behind the body), tripod gait: front + back of one side move with
  // the middle leg of the other side. Elbowed: femur out, tibia to the foot.
  const spurs = stacks('leg_spurs');
  const knees: Array<[number, number, number, number, number]> = []; // hipX, kneeX, kneeY, side, leg index
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 3; i++) {
      const groupA = (i + (side === 1 ? 1 : 0)) % 2 === 0;
      const s = groupA ? swing : -swing;
      const hipX = c.hips[i];
      const footX = hipX + (i - 1) * c.splay + s;
      const kneeX = Math.round(hipX + (footX - hipX) * 0.45);
      const kneeY = AXIS + side * Math.round(c.reach * 0.7);
      // Dark flesh, not outline black, so the legs read on dark regolith
      p.polyline([[hipX, AXIS + side], [kneeX, kneeY], [footX, AXIS + side * c.reach]], F[1]);
      // Stout legs: a second strand beside the first makes them 2 px thick
      if (c.stout) p.polyline([[hipX - 1, AXIS + side], [kneeX - 1, kneeY], [footX - 1, AXIS + side * c.reach]], F[1]);
      knees.push([hipX, kneeX, kneeY, side, i]);
    }
  }
  // Bone spurs: a pale spike out of every knee, over all the legs (longer at
  // 2 stacks, plus a femur spike at 3)
  for (const [hipX, kneeX, kneeY, side, i] of spurs > 0 ? knees : []) {
    p.px(kneeX, kneeY + side, F[4]);
    if (spurs > 1) p.px(kneeX + (i - 1), kneeY + side * 2, F[4]);
    if (spurs > 2) p.px(Math.round((hipX + kneeX) / 2), AXIS + side * Math.round(c.reach * 0.45) + side, F[4]);
  }

  // Body silhouette as ONE outlined union so the waist pinch gets a clean,
  // continuous 1-px outline: gaster + petiole + thorax + neck + head.
  p.outlined(pen => {
    pen.ellipse(c.gx, AXIS, grx, gry, tones[0]);
    for (const x of c.petiole) pen.px(x, AXIS, c.skin === 'pale' ? F[3] : F[2]);
    pen.ellipse(c.thCx, AXIS, c.thRx, c.thRy, skin === 'plated' ? F[1] : F[3]);
    if (c.neck !== null) pen.px(c.neck, AXIS, c.skin === 'pale' ? F[3] : F[2]);
    if (c.shieldHead) pen.rect(c.hX - 2, AXIS - 4, 5, 9, F[1]);
    else pen.disc(c.hX, AXIS, c.hR, F[3]);
  }, O);

  // Gaster: body tone inside the flanks, lit ridges on both sides of the vein
  p.ellipse(c.gx, AXIS, grx - 1, gry - 1, tones[1]);
  p.hline(c.gx - 1, AXIS - 1, 3, tones[2]);
  p.hline(c.gx - 1, mirror(AXIS - 1), 3, tones[2]);
  // Stretch seams across a swollen sac
  if (sacs > 0) {
    for (const sx of sacs > 2 ? [c.gx - 2, c.gx, c.gx + 2] : [c.gx - 2, c.gx + 2]) {
      const hh = gasterHalf(sx) - 1;
      if (hh > 0) p.vline(sx, AXIS - hh, hh * 2 + 1, F[2]);
    }
  }

  // Carrion gut: dark digestive rings around the gaster (more rings per stack)
  const rings = stacks('dark_gaster_rings');
  if (rings > 0) {
    const cols = [[-1, 1], [-2, 0, 2], [-3, -1, 1, 3]][rings - 1];
    for (const dx of cols) {
      const hh = gasterHalf(c.gx + dx);
      if (hh > 0) p.vline(c.gx + dx, AXIS - hh, hh * 2 + 1, F[0]);
    }
  }

  // Regenerative tissue: dark wounds laced shut with a zigzag of pink fibres
  const stitches = stacks('pink_stitches');
  const wound = (x0: number, len: number, y: number): void => {
    p.rect(x0, y, len, 2, F[0]);
    for (let k = 0; k < len; k++) p.px(x0 + k, y + (k % 2), F[4]);
  };
  if (stitches > 0) wound(c.gx - 2, 5, AXIS - 3);
  if (stitches > 1) wound(c.gx - 1, 4, AXIS + 2);
  if (stitches > 2) {
    p.line(c.hX - 1, AXIS - 1, c.hX + 1, AXIS + 1, F[0]);
    p.px(c.hX - 1, AXIS + 1, F[4]);
    p.px(c.hX + 1, AXIS - 1, F[4]);
  }

  // The glowing vein: bright core along the body axis, dim tips, thorax node.
  // Plated defenders show it only between their armor plates.
  if (skin === 'plated') {
    for (const sx of [c.gx - 2, c.gx + 2]) {
      p.vline(sx, AXIS - 2, 5, F[0]);
      p.px(sx, AXIS - 3, F[3]);
      p.px(sx, mirror(AXIS - 3), F[3]);
    }
    p.px(c.gx - 1, AXIS, V[0]);
    p.px(c.gx, AXIS, V[1]);
    p.px(c.gx + 1, AXIS, V[0]);
  } else {
    const half = Math.floor(grx - 0.5);
    // Pale nurse skin is thin: the vein shows through it dimmer, brightest at the core
    p.hline(c.gx - half, AXIS, half * 2 + 1, c.skin === 'pale' ? V[0] : V[1]);
    p.px(c.gx, AXIS, V[1]);
    p.px(c.gx - half, AXIS, V[0]);
    p.px(c.gx + half, AXIS, V[0]);
  }
  p.px(c.thCx, AXIS, V[1]);
  p.px(c.thCx - 1, AXIS, V[0]);

  // Hyper metabolism: the vein floods the whole axis, widens, then branches
  const surge = stacks('pulsing_vein');
  if (surge > 0) {
    const half = Math.floor(grx - 0.5);
    const side = surge > 2 ? V[1] : V[0];
    p.hline(c.gx - half, AXIS, c.hX - (c.gx - half) + 1, V[1]);
    p.hline(c.gx - 1, AXIS - 1, 3, side);
    p.hline(c.gx - 1, mirror(AXIS - 1), 3, side);
    if (surge > 1) {
      for (const tx of [c.gx - 2, c.gx + 2]) {
        if (gasterHalf(tx) >= 2) both(tx, AXIS - 2, side);
      }
    }
  }

  // Spore bloom: blisters bulging out of the thorax, puffing spore motes
  // between the legs (more motes per stack, gaster blisters at 3)
  const spores = stacks('thorax_pustules');
  if (spores > 0) {
    const top = Math.floor(c.thRy + 0.25);
    both(c.thCx, AXIS - 1, F[4]);
    both(c.thCx, AXIS - top - 1, F[3]);
    both(c.thCx, AXIS - top - 2, F[4]);
    p.px(c.thCx - 1, AXIS - 5, F[4]);
    p.px(c.thCx + 1, mirror(AXIS - 5), F[4]);
  }
  if (spores > 1) {
    p.px(c.thCx + 1, AXIS - 6, F[3]);
    p.px(c.thCx - 2, mirror(AXIS - 6), F[3]);
  }
  if (spores > 2) {
    both(c.gx + 2, AXIS - 1, F[4]);
    both(c.gx + 2, AXIS - 2, V[0]);
  }

  // Shield head: a dark armor rim around a raised plate with a lit ridge,
  // and the horn jutting forward from its front edge
  if (c.shieldHead) {
    p.rect(c.hX - 1, AXIS - 3, 3, 7, F[2]);
    p.vline(c.hX, AXIS - 2, 5, F[3]);
    p.px(c.hX - 1, AXIS, F[3]);
  }
  if (c.horn) {
    p.hline(c.hX + 3, AXIS, 3, F[4]);
    p.px(c.hX + 3, AXIS - 1, F[3]);
    p.px(c.hX + 3, mirror(AXIS - 1), F[3]);
  }
  // Plated thorax: a dark rim around a raised dorsal plate
  if (skin === 'plated' && c.thRy >= 2) p.ellipse(c.thCx, AXIS, c.thRx - 1, c.thRy - 1, F[2]);

  // Titan brood: a thick, knobbed armor plate over the soldier's head
  const plate = stacks('thick_head_plate');
  if (plate > 0 && !c.shieldHead) {
    p.disc(c.hX, AXIS, c.hR - 0.5, F[1]);
    p.disc(c.hX, AXIS, c.hR - 1.5, F[3]);
    both(c.hX - 2, AXIS - 2, F[4]);
    both(c.hX + 2, AXIS - 2, F[4]);
    if (plate > 1) both(c.hX - 1, AXIS - Math.ceil(c.hR) - 1, F[4]);
    if (plate > 2) {
      p.vline(c.hX - 1, AXIS - 1, 3, F[0]);
      both(c.hX + 1, AXIS - Math.ceil(c.hR) - 1, F[4]);
    }
  }

  // Glowing eyes on the head flanks
  both(c.eye[0], c.eye[1], V[1]);

  // 1-px bone spines on the silhouette edge (riding up on a swollen sac)
  for (const [sx, sy] of c.spines) {
    const lift = sx < c.petiole[0] ? Math.round(0.5 * sacs) : 0;
    both(sx, sy - lift, F[3]);
  }

  // Wing stubs: atrophied membrane wings on the scout's thorax, longer per stack
  const wings = stacks('wing_stubs');
  if (wings > 0) {
    const len = 2 + wings;
    for (const side of [-1, 1]) {
      const base: ArtPoint = [c.thCx - 1, AXIS + side * 2];
      const tip: ArtPoint = [c.thCx - 1 - len, AXIS + side * (2 + Math.ceil(len * 0.7))];
      p.outlined(pen => pen.capsule(base[0], base[1], tip[0], tip[1], 0.7, F[4]), O);
      p.line(base[0], base[1], tip[0], tip[1], F[3]);
      if (wings > 2) {
        p.outlined(pen => pen.capsule(c.thCx, AXIS + side * 2, c.thCx - 2, AXIS + side * 4, 0.5, F[4]), O);
      }
    }
  }

  // Carrying: a leaf chunk held in the mandibles, ahead of the head
  if (carrying === 'ore') {
    // A miner's load: a faceted cyan crystal chunk, bigger than a leaf bit so it reads at a glance
    const K = PAL.crystal.shell;
    p.outlined(pen => pen.poly([[c.mouth - 2, AXIS - 2], [c.mouth + 1, AXIS - 2], [c.mouth + 2, AXIS], [c.mouth + 1, AXIS + 2], [c.mouth - 2, AXIS + 2], [c.mouth - 3, AXIS]], K[3]), PAL.crystal.outline);
    p.line(c.mouth - 2, AXIS - 1, c.mouth, AXIS - 1, K[4]);
    p.line(c.mouth - 1, AXIS + 1, c.mouth + 1, AXIS + 1, K[1]);
  } else if (carrying) {
    p.outlined(pen => pen.ellipse(c.mouth, AXIS, 1.2, 1.8, PAL.leaf[1]), O);
    p.vline(c.mouth, AXIS - 1, 3, PAL.leaf[0]);
  }

  // Nurse: a pale nectar droplet held between the jaws for the brood
  if (c.droplet && !carrying) p.hline(c.mouth, AXIS, 2, F[4]);

  // Scythe mandibles (pale bone, unoutlined so the hooks stay 1 px sharp).
  // Acid mandibles turn them chartreuse and drip acid between the jaws.
  const acid = stacks('chartreuse_jaws');
  for (const jaw of c.jaws) {
    const color = acid > 0 ? (jaw.tone >= 4 || acid > 2 ? V[1] : V[0]) : F[jaw.tone];
    p.polyline(jaw.points, color);
    p.polyline(mirrored(jaw.points), color);
  }
  if (acid > 1) both(c.hX + 5, AXIS - 1, V[0]);
  if (acid > 2) {
    both(c.hX + 4, AXIS - 1, V[1]);
    p.px(c.hX + 6, AXIS, V[1]);
  }

  // Elbowed antennae that flick across frames (the scout's are longest)
  // (mirroring the flicked tip flicks the lower antenna the other way)
  const [root, elbow, tip] = c.antenna;
  const tipY = tip[1] + flick;
  const antenna: ArtPoint[] = [root, elbow, [tip[0], tipY]];
  p.polyline(antenna, F[2]);
  p.polyline(mirrored(antenna), F[2]);
  // Hive mind: glowing antenna tips (the glow climbs toward the elbow per stack)
  const mind = stacks('glowing_antenna_tips');
  if (mind > 1) {
    const bx = Math.round(tip[0] + (elbow[0] - tip[0]) * 0.34);
    const by = Math.round(tipY + (elbow[1] - tipY) * 0.34);
    p.line(tip[0], tipY, bx, by, V[0]);
    p.line(tip[0], mirror(tipY), bx, mirror(by), V[0]);
  }
  if (mind > 2) both(elbow[0], elbow[1], V[0]);
  if (mind > 0) both(tip[0], tipY, V[1]);

  // Chitin carapace: dark armor plates across the thorax (and the gaster's front at 2+ stacks)
  const chitin = stacks('chitin_plates');
  if (chitin > 0) {
    p.hline(c.thCx - 1, AXIS - 1, 3, F[0]);
    p.hline(c.thCx - 1, mirror(AXIS - 1), 3, F[0]);
    if (chitin > 1) for (const dy of [2, 1]) both(c.gx + Math.round(grx) - 1, AXIS - dy, F[0]);
    if (chitin > 2) both(c.thCx, AXIS - 2, F[4]);
  }
  // Venom glands: a green sac glowing at the gaster's tip, bigger per stack
  const venom = stacks('venom_sac');
  if (venom > 0) {
    const tail = Math.round(c.gx - grx);
    p.px(tail, AXIS, PAL.acid[2]);
    if (venom > 1) both(tail + 1, AXIS - 1, PAL.acid[1]);
    if (venom > 2) p.px(tail - 1, AXIS, PAL.acid[3]);
  }
  // Brood frenzy: glowing nodes along the nurse's gaster
  const brood = stacks('brood_nodes');
  for (let i = 0; i < brood; i++) both(c.gx - 1 + i, AXIS - Math.max(1, Math.floor(gry) - 1), V[1]);
  // Night eyes: big phosphor-green compound eyes
  const eyes = stacks('compound_eyes');
  if (eyes > 0) {
    both(c.hX + 1, AXIS - 1, PAL.acid[3]);
    if (eyes > 1) both(c.hX, AXIS - 2, PAL.acid[2]);
    if (eyes > 2) both(c.hX + 2, AXIS - 2, PAL.acid[2]);
  }
  // Royal shell: the queen's gold sigil worn on the thorax
  const sigil = stacks('royal_sigil');
  if (sigil > 0) {
    p.px(c.thCx, AXIS, PAL.queen);
    if (sigil > 1) both(c.thCx, AXIS - 1, PAL.queen);
    if (sigil > 2) both(c.thCx - 1, AXIS - 1, PAL.legionCrown);
  }
  // Sentinel spines: a crest of pale spikes down the back, more per stack
  const spines = stacks('dorsal_spines');
  // (on the gaster's rim, so they stay inside the rotation-safe circle)
  for (let i = 0; i < spines * 2; i++) {
    const x = Math.round(c.gx + grx - 2) - i;
    const half = gasterHalf(x);
    if (half > 0) both(x, AXIS - half, F[4]);
  }

  // Screen-space light: top-left rim, sheen on the gaster and head, cast shadow
  p.shade([F, PAL.leaf]);
  p.sheen(c.gx, AXIS, Math.max(1, Math.round(Math.min(grx, gry) * 0.6)), F[4]);
  if (!c.shieldHead && c.hR >= 1.8 && plate === 0) p.sheen(c.hX, AXIS, 1, F[4]);
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
