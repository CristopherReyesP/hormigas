import { hash2 } from '../../engine/renderer/pixelart/palette';
import type { HumanBuildingKind } from '../rival/humanBase';
import type { TilePos } from '../run/craterSite';
import type { RivalId } from '../run/RunSetup';
import { INTRO_TIMELINE as T, meteorAltitude, meteorGround, type IntroVariant, type Vec2 } from './introTimeline';

/**
 * Pure choreography for the rival-specific parts of the opening cinematic,
 * on the shared intro clock (see introTimeline.ts for the shared beats and
 * the Crystal Hive's deployment).
 *
 * Humans: a dropship flies in over the colony, brakes on its thrusters and
 * touches down on the Human base site in a ring of dust. It lifts off again
 * and leaves the base unfolding behind it: scaffolding rises floor by floor
 * into the command center, then the barracks, bunker and depot; soldiers
 * march out of the blast doors to their posts, and a searchlight on the
 * command center's roof sweeps the ground.
 *
 * Wildlife: there is no alien base to bring in. The meteorite still strikes
 * the crater (it seeds the run's crystal field), and its impact wakes the
 * wildlife: the ground rumbles at burrows around the rim, then beetles and
 * leapers burst out and scatter away from the crater.
 *
 * A Crystal or Human player watches their own base arrive at the map
 * center instead: the crystal meteor comes in from the far side of the
 * map, away from the rival, and the Hive's crown crystallizes out of its
 * crater (hiveCrownGrowth); or the expedition's dropship lands there and
 * raises the Command Center and the Cuartel, as the Human rival's does.
 */

/** What the opening brings in, as GameManager stages it. */
export interface IntroArrival {
  variant: IntroVariant;
  /** Tile the meteor strikes or the dropship lands on: the crater, or the Human command center */
  target: TilePos;
  /** The line under the title card, e.g. "RIVAL: HUMANOS" */
  rivalLine: string;
  /** Humans only: the real starting base the arrival raises (tile coordinates) */
  base?: IntroHumanBase;
  /** A player race's own arrival: the tile the meteor or the dropship comes in from (the Swarm's comes from over its nest) */
  from?: TilePos;
  /** Who the player is up against; it colors the rival line and the marker toward their base */
  rival?: RivalId;
  /** A player race's own arrival: the rival's base, which the camera glances toward at the end; null or absent for the wildlife */
  rivalBase?: TilePos | null;
  /** A Crystal player: where the starting drones stand when the run starts (tile coordinates, fractional) */
  drones?: ReadonlyArray<{ x: number; y: number }>;
}

export interface IntroHumanBase {
  /** The command center first */
  buildings: ReadonlyArray<{ kind: HumanBuildingKind; x: number; y: number }>;
  /** Where the starting troops stand; the builder is drawn smaller */
  troops: ReadonlyArray<{ x: number; y: number; builder: boolean }>;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: Vec2, b: Vec2, f: number): Vec2 => ({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
const easeOutCubic = (f: number): number => 1 - (1 - f) ** 3;

// ── A player race's own arrival ───────────────────────────────────────

/** Tiles from home to where a player race's arrival comes in from, and how far from the map edge it must stay. */
const LAUNCH_DISTANCE = 26;
const LAUNCH_MARGIN = 4;
/** With no rival base to turn away from, the arrival comes in from the upper left. */
const DEFAULT_LAUNCH_HEADING = { x: -0.8, y: -0.6 } as const;

/**
 * Where a player race's meteor or dropship comes in from: a point on the
 * far side of home from the rival's base, so the camera's chase and the
 * ground it lights run away from the rival, kept inside the map.
 */
export function playerLaunchTile(home: TilePos, rivalBase: TilePos | null, size: { width: number; height: number }): TilePos {
  let dx: number = DEFAULT_LAUNCH_HEADING.x;
  let dy: number = DEFAULT_LAUNCH_HEADING.y;
  if (rivalBase) {
    const len = Math.hypot(rivalBase.x - home.x, rivalBase.y - home.y);
    if (len > 0) {
      dx = (home.x - rivalBase.x) / len;
      dy = (home.y - rivalBase.y) / len;
    }
  }
  const clampTo = (v: number, max: number) => Math.max(LAUNCH_MARGIN, Math.min(max - 1 - LAUNCH_MARGIN, Math.round(v)));
  return { x: clampTo(home.x + dx * LAUNCH_DISTANCE, size.width), y: clampTo(home.y + dy * LAUNCH_DISTANCE, size.height) };
}

/** Intro seconds of a Crystal player's Hive crown crystallizing out of the crater. */
export const HIVE_RISE = {
  /** After the shockwave has rolled out past the rim */
  start: 3.15,
  stagger: 0.14,
  grow: 0.7,
} as const;

/** The central prism (crown piece 2) rises first, then the towers around it. */
const CROWN_RISE_ORDER = [1, 2, 0, 3, 4] as const;

/** Crown piece `i` of a Crystal player's Hive grown 0..1, in eighths so it pushes up in pixel steps; 1 once up. */
export function hiveCrownGrowth(i: number, t: number): number {
  const rank = CROWN_RISE_ORDER[i] ?? i;
  const start = HIVE_RISE.start + rank * HIVE_RISE.stagger;
  if (t < start) return 0;
  const f = (t - start) / HIVE_RISE.grow;
  if (f >= 1) return 1;
  return Math.max(1, Math.floor(easeOutCubic(f) * 8)) / 8;
}

// ── Humans ─────────────────────────────────────────────────────────────

/** Intro seconds of the Human arrival (the flight and touchdown share INTRO_TIMELINE). */
export const HUMAN_LANDING = {
  /** The dust ring the landing kicks up */
  dustDuration: 1.3,
  /** The dropship climbs away once it has set the base down */
  liftoffStart: 3.2,
  liftoffDuration: 1.1,
  /** Each building rises floor by floor, the command center first */
  buildStart: 3.4,
  buildDuration: 0.8,
  buildStagger: 0.26,
  /** Soldiers march out of the command center's blast doors */
  troopStart: 4.4,
  troopStagger: 0.22,
  troopMarch: 0.9,
  /** The searchlight on the command center's roof comes on and sweeps */
  searchlightStart: 4.3,
} as const;

const H = HUMAN_LANDING;

export interface DropshipState extends Vec2 {
  /** World px above its ground point */
  alt: number;
  /** Engine burn: 0 off, 1 cruise, 2 full (braking near the ground, lifting off) */
  thrust: 0 | 1 | 2;
  /** Nose toward smaller x */
  facingLeft: boolean;
  /** Down on its struts */
  landed: boolean;
}

/** World px the dropship drifts on as it climbs away, and its top altitude as a share of `alt0`. */
const LIFTOFF_DRIFT = 220;
const LIFTOFF_ALT = 1.3;

/**
 * The dropship at intro time `t`: it follows the shared flight (braking into
 * the landing), sits on its struts with its engines off, then climbs away on
 * full burn and drifts on past the site. Null before the flight and once it
 * has left.
 */
export function dropshipState(t: number, nest: Vec2, site: Vec2, alt0: number): DropshipState | null {
  const facingLeft = site.x < nest.x;
  if (t < T.meteorStart) return null;
  if (t < T.impact) {
    const g = meteorGround(t, nest, site, 'human')!;
    const alt = meteorAltitude(t, alt0, 'human');
    return { ...g, alt, thrust: alt < alt0 * 0.2 ? 2 : 1, facingLeft, landed: false };
  }
  if (t < H.liftoffStart) return { x: site.x, y: site.y, alt: 0, thrust: 0, facingLeft, landed: true };
  const s = (t - H.liftoffStart) / H.liftoffDuration;
  if (s >= 1) return null;
  const len = Math.hypot(site.x - nest.x, site.y - nest.y) || 1;
  const drift = LIFTOFF_DRIFT * s * s;
  return {
    x: site.x + ((site.x - nest.x) / len) * drift,
    y: site.y + ((site.y - nest.y) / len) * drift,
    alt: alt0 * LIFTOFF_ALT * s * s,
    thrust: 2,
    facingLeft,
    landed: false,
  };
}

/** The dust ring of the touchdown, 0..1; null outside it. */
export function landingDustProgress(t: number): number | null {
  if (t < T.impact || t >= T.impact + H.dustDuration) return null;
  return (t - T.impact) / H.dustDuration;
}

/** Building `i` (the command center is 0) built 0..1, in eighths so it rises in pixel steps; 1 once up. */
export function humanBuildProgress(i: number, t: number): number {
  const start = H.buildStart + i * H.buildStagger;
  if (t < start) return 0;
  const f = (t - start) / H.buildDuration;
  if (f >= 1) return 1;
  return Math.max(1, Math.floor(easeOutCubic(f) * 8)) / 8;
}

export interface TroopState extends Vec2 {
  marching: boolean;
  /** Alternating footfall while marching (0 or 1): the sprite bobs an art px */
  step: 0 | 1;
  /** Heading toward smaller x */
  facingLeft: boolean;
}

/** World px a soldier steps out in front of the doors before it turns for its post, and the share of the march that takes. */
const APRON = 30;
const APRON_SHARE = 0.3;

/**
 * Troop `i` at intro time `t`: out of the blast doors at `door`, a few steps
 * straight out onto the apron, then a steady march to `post`, then at ease.
 */
export function troopState(i: number, t: number, door: Vec2, post: Vec2): TroopState | null {
  const start = H.troopStart + i * H.troopStagger;
  if (t < start) return null;
  const s = t - start;
  const f = clamp01(s / H.troopMarch);
  const apron = { x: door.x + (i % 2 ? -1 : 1) * 4 * (i >> 1), y: door.y + APRON };
  const at = f >= 1 ? { x: post.x, y: post.y } : f < APRON_SHARE ? lerp(door, apron, f / APRON_SHARE) : lerp(apron, post, (f - APRON_SHARE) / (1 - APRON_SHARE));
  const heading = f < APRON_SHARE ? apron.x - door.x : post.x - apron.x;
  return { ...at, marching: f < 1, step: f < 1 ? ((Math.floor(s * 8) % 2) as 0 | 1) : 0, facingLeft: heading < 0 || (heading === 0 && post.x < door.x) };
}

/** World px from the command center to the searchlight's spot, and its sweep (radians either side). */
const SEARCH_REACH = 190;
const SEARCH_SWEEP = 0.9;
const SEARCH_RATE = 1.7;

export interface SearchlightSpot extends Vec2 {
  /** Brightness step: 0 flickering on, 1 steady */
  level: 0 | 1;
}

/**
 * Where the command center's searchlight falls at intro time `t`: a spot
 * that sweeps back and forth across the approach from the colony. It
 * flickers on, and goes out with the cinematic once the camera is home.
 */
export function searchlightSpot(t: number, origin: Vec2, nest: Vec2): SearchlightSpot | null {
  if (t < H.searchlightStart || t >= T.returnEnd) return null;
  const s = t - H.searchlightStart;
  const heading = Math.atan2(nest.y - origin.y, nest.x - origin.x);
  const a = heading + SEARCH_SWEEP * Math.sin(s * SEARCH_RATE - Math.PI / 2);
  // Flicker on: on, off, on, then steady
  const level: 0 | 1 = s < 0.25 ? 0 : 1;
  return { x: origin.x + Math.cos(a) * SEARCH_REACH, y: origin.y + Math.sin(a) * SEARCH_REACH * 0.7, level };
}

/** The searchlight blinks twice as it comes on. */
export function searchlightOn(t: number): boolean {
  const s = t - H.searchlightStart;
  if (s < 0 || t >= T.returnEnd) return false;
  return s >= 0.25 || Math.floor(s / 0.06) % 2 === 0;
}

// ── Wildlife ───────────────────────────────────────────────────────────

export type WakeCritterKind = 'beetle' | 'leaper';

/** What wakes, in burst order. */
export const WAKE_CRITTERS: readonly WakeCritterKind[] = ['beetle', 'leaper', 'beetle', 'beetle', 'leaper', 'beetle'];

/** Intro seconds of the wildlife waking. */
export const WILDLIFE_WAKE = {
  /** After the shockwave has rolled past the rim */
  start: 3.3,
  stagger: 0.17,
  /** The ground shudders over the burrow */
  rumble: 0.45,
  /** It pushes up out of the dirt */
  emerge: 0.2,
  /** Then scatters away from the crater */
  run: 1.9,
} as const;

const W = WILDLIFE_WAKE;

export interface WakeCritter extends Vec2 {
  kind: WakeCritterKind;
  /** Heading (radians), away from the crater */
  angle: number;
  /** Walk cycle phase (radians) for the sprite sheets */
  legPhase: number;
  /** World px off the ground (leapers' hops) */
  lift: number;
  pose: 'walk' | 'crouch' | 'leap';
  /** How much of it is out of the ground, in eighths: 0 while the ground rumbles, 1 once out */
  emerge: number;
  /** The burrow it came out of */
  burrow: Vec2;
}

/** World px from the impact to the burrows, and how far the critters scatter. */
const BURROW_REACH = 120;
const SCATTER_REACH = 210;
const HOP_PERIOD = 0.5;
const HOP_HEIGHT = 30;
/** The ground is seen from above at an angle: rings are squashed */
const GROUND_TILT = 0.75;

/** Burrow `i` around the crater rim, spread evenly with a little jitter. */
function burrowOf(i: number, impact: Vec2): { at: Vec2; angle: number } {
  const n = WAKE_CRITTERS.length;
  const angle = (i / n) * Math.PI * 2 + (hash2(i, 211) - 0.5) * 0.6 + 0.4;
  const r = BURROW_REACH + hash2(i, 223) * 40;
  return { at: { x: impact.x + Math.cos(angle) * r, y: impact.y + Math.sin(angle) * r * GROUND_TILT }, angle };
}

/**
 * Critter `i` woken by the impact, at intro time `t`: the ground rumbles over
 * its burrow, it pushes out (tip first, in eighths), then scatters outward,
 * beetles at a scuttle and leapers in hops. Purely visual, gone once the
 * camera has left.
 */
export function wakeCritter(i: number, t: number, impact: Vec2, _nest: Vec2): WakeCritter | null {
  const start = W.start + i * W.stagger;
  if (t < start || t >= T.returnEnd) return null;
  const kind = WAKE_CRITTERS[i % WAKE_CRITTERS.length];
  const { at, angle: out } = burrowOf(i, impact);
  const angle = out + (hash2(i, 239) - 0.5) * 0.7;
  const base = { kind, angle, legPhase: 0, lift: 0, pose: 'walk' as const, burrow: at, ...at };
  const s = t - start;
  if (s < W.rumble) return { ...base, emerge: 0 };
  if (s < W.rumble + W.emerge) {
    return { ...base, pose: kind === 'leaper' ? 'crouch' : 'walk', emerge: Math.max(1, Math.floor(((s - W.rumble) / W.emerge) * 8)) / 8 };
  }
  const r = s - W.rumble - W.emerge;
  const f = clamp01(r / W.run);
  const reach = SCATTER_REACH * (0.85 + hash2(i, 251) * 0.3);
  const along = reach * (1 - (1 - f) ** 1.6);
  const pos = { x: at.x + Math.cos(angle) * along, y: at.y + Math.sin(angle) * along * GROUND_TILT };
  if (kind === 'beetle') return { ...base, ...pos, legPhase: r * 16, emerge: 1 };
  // Leapers bound: a crouch, then an arc, again and again until they have scattered
  if (f >= 1) return { ...base, ...pos, emerge: 1 };
  const hop = (r % HOP_PERIOD) / HOP_PERIOD;
  if (hop < 0.25) return { ...base, ...pos, pose: 'crouch', emerge: 1 };
  const air = (hop - 0.25) / 0.75;
  return { ...base, ...pos, pose: 'leap', lift: Math.round(HOP_HEIGHT * 4 * air * (1 - air)), emerge: 1 };
}

export interface DirtClod extends Vec2 {
  alt: number;
}

export const DIRT_CLODS = 6;

/** Clod `k` thrown out of critter `i`'s burrow as it bursts out; null outside its short arc. */
export function burstClod(i: number, k: number, t: number, impact: Vec2): DirtClod | null {
  const s = t - (W.start + i * W.stagger + W.rumble);
  const life = 0.45 + hash2(i * 7 + k, 263) * 0.2;
  if (s < 0 || s >= life) return null;
  const f = s / life;
  const { at } = burrowOf(i, impact);
  const a = hash2(i * 13 + k, 271) * Math.PI * 2;
  const reach = 14 + hash2(k, i + 277) * 26;
  return {
    x: at.x + Math.cos(a) * reach * f,
    y: at.y + Math.sin(a) * reach * f * GROUND_TILT,
    alt: 4 * (14 + hash2(k, i + 281) * 22) * f * (1 - f),
  };
}
