import { hash2 } from '../../engine/renderer/pixelart/palette';

/**
 * Pure timing and motion for the run's opening cinematic. Letterbox bars
 * slide in over the colony, a meteorite streaks across the map with the
 * camera chasing it, time slows for the last stretch, it hits (flash, shake,
 * shockwave, ejecta), crystal spires grow out of the crater, a cyan pulse
 * rings out and the first Crystal drones rise out of the crater, unfold
 * their orbiting shards and glide toward the colony. Then the camera glides
 * home and the title card shows over the colony.
 *
 * Everything here is a function of INTRO time, so pausing holds the intro
 * and tests can sample any moment. IntroClock maps real frame time to intro
 * time (that is where the slow motion lives). MeteorIntro draws, and
 * IntroDirector steers the camera.
 */

export interface Vec2 {
  x: number;
  y: number;
}

/** The title card, one line per row of the big pixel font. */
export const INTRO_TITLE_LINES = ['EL ENJAMBRE', 'DESPIERTA'] as const;
export const INTRO_TITLE = INTRO_TITLE_LINES.join(' ');

/** Intro seconds (not real seconds: the slow motion stretches the end of the flight). */
export const INTRO_TIMELINE = {
  /** Letterbox bars finish sliding in */
  letterboxIn: 0.5,
  meteorStart: 0.6,
  /** The last stretch of the flight plays at `slowMoScale` */
  slowMoStart: 2.66,
  slowMoScale: 0.25,
  impact: 2.8,
  /** The camera trails the meteor by this much, then settles onto the crater */
  cameraLag: 0.15,
  cameraSettle: 0.46,
  shakeDuration: 0.5,
  shockwaveDuration: 1.8,
  spireStart: 3.3,
  spireGrow: 0.7,
  spireStagger: 0.14,
  pulseStart: 4.0,
  pulseDuration: 1.1,
  droneStart: 4.05,
  droneStagger: 0.12,
  /** A drone pushes up out of the crater floor, then lifts off to hover height */
  droneEmerge: 0.2,
  droneRise: 0.3,
  /** Its core wakes and its shards swing out into orbit */
  droneUnfold: 0.35,
  droneGlide: 1.5,
  returnStart: 5.9,
  returnEnd: 7.3,
  sporeStart: 5.7,
  sporeEnd: 9.4,
  titleStart: 7.0,
  titleEnd: 9.5,
  titleFade: 0.5,
  letterboxOutStart: 9.4,
  letterboxOut: 0.5,
  end: 10.0,
} as const;

const T = INTRO_TIMELINE;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: Vec2, b: Vec2, f: number): Vec2 => ({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
const easeOutCubic = (f: number): number => 1 - (1 - f) ** 3;
const easeInOutCubic = (f: number): number => (f < 0.5 ? 4 * f ** 3 : 1 - (-2 * f + 2) ** 3 / 2);

/** Skip input is ignored until the meteor has landed, so a focus click cannot cut the flight. */
export function canSkipIntro(t: number): boolean {
  return t >= T.impact;
}

export type IntroPhase = 'calm' | 'meteor' | 'impact' | 'deploy' | 'return' | 'aftermath' | 'done';

export function introPhase(t: number): IntroPhase {
  if (t < T.meteorStart) return 'calm';
  if (t < T.impact) return 'meteor';
  if (t < T.impact + T.shakeDuration) return 'impact';
  if (t < T.returnStart) return 'deploy';
  if (t < T.returnEnd) return 'return';
  if (t < T.end) return 'aftermath';
  return 'done';
}

/** How fast intro time runs against real time at intro time `t`. */
export function introTimeScale(t: number): number {
  return t >= T.slowMoStart && t < T.impact ? T.slowMoScale : 1;
}

/** Intro times where the time scale changes, then the end. */
const CLOCK_BOUNDARIES = [T.slowMoStart, T.impact, T.end] as const;

/**
 * Real frame time → intro time, with the slow motion before the impact. A
 * long frame is integrated piecewise across the scale boundaries, so the
 * result does not depend on the frame rate. Skipping jumps to the end
 * state, which every timeline function treats as "the intro is over".
 */
export class IntroClock {
  private t = 0;

  get elapsed(): number {
    return this.t;
  }

  /** `dt` in real seconds (0 while paused). */
  advance(dt: number): void {
    let real = dt > 0 ? dt : 0;
    while (real > 0 && this.t < T.end) {
      const scale = introTimeScale(this.t);
      const next = CLOCK_BOUNDARIES.find((b) => b > this.t) ?? T.end;
      const need = (next - this.t) / scale; // real seconds to reach the next boundary
      if (real < need) {
        this.t += real * scale;
        return;
      }
      this.t = next;
      real -= need;
    }
  }

  /** Jump to the end state; refused (false) until skipping is allowed. */
  skip(): boolean {
    if (!canSkipIntro(this.t)) return false;
    this.t = T.end;
    return true;
  }

  isPlaying(): boolean {
    return this.t < T.end;
  }
}

/** Letterbox bars: 0 = gone, 1 = fully in. Ease-out slide in, ease-in slide out. */
export function letterboxAmount(t: number): number {
  if (t <= 0 || t >= T.letterboxOutStart + T.letterboxOut) return 0;
  if (t < T.letterboxIn) return easeOutCubic(t / T.letterboxIn);
  if (t < T.letterboxOutStart) return 1;
  return 1 - ((t - T.letterboxOutStart) / T.letterboxOut) ** 3;
}

/** The meteor's flight curve: accelerating, 0 at launch and 1 at the impact. */
function flightCurve(u: number): number {
  return clamp01(u) ** 1.6;
}

/** Flight progress 0..1, accelerating as it falls; null outside the flight. */
export function meteorProgress(t: number): number | null {
  if (t < T.meteorStart || t >= T.impact) return null;
  return flightCurve((t - T.meteorStart) / (T.impact - T.meteorStart));
}

/**
 * The point on the ground under the meteor (world px): it launches over the
 * colony and runs out to the impact. Null outside the flight.
 */
export function meteorGround(t: number, nest: Vec2, impact: Vec2): Vec2 | null {
  const p = meteorProgress(t);
  return p === null ? null : lerp(nest, impact, p);
}

/**
 * Height of the fireball above its ground point (world px), from `alt0`
 * at launch down to the ground at the impact. The fireball is drawn this
 * far above its shadow.
 */
export function meteorAltitude(t: number, alt0: number): number {
  if (t <= T.meteorStart) return alt0;
  if (t >= T.impact) return 0;
  const u = (t - T.meteorStart) / (T.impact - T.meteorStart);
  return alt0 * (1 - u) ** 1.25;
}

/**
 * Where the camera looks (world px). It holds on the colony, chases the
 * meteor's ground point a beat behind, settles onto the crater with an
 * ease-out whose opening speed matches the chase, holds there for the
 * deployment, then glides home with an ease-in-out.
 */
export function introCameraFocus(t: number, nest: Vec2, impact: Vec2): Vec2 {
  const flight = T.impact - T.meteorStart;
  if (t < T.impact) {
    return lerp(nest, impact, flightCurve((t - T.cameraLag - T.meteorStart) / flight));
  }
  if (t < T.impact + T.cameraSettle) {
    const atImpact = flightCurve((T.impact - T.cameraLag - T.meteorStart) / flight);
    return lerp(nest, impact, atImpact + (1 - atImpact) * easeOutCubic((t - T.impact) / T.cameraSettle));
  }
  if (t < T.returnStart) return { x: impact.x, y: impact.y };
  if (t < T.returnEnd) return lerp(impact, nest, easeInOutCubic((t - T.returnStart) / (T.returnEnd - T.returnStart)));
  return { x: nest.x, y: nest.y };
}

/** The camera punches in one zoom step under the impact flash and pulls back out for the trip home. */
export function introCameraZoom(t: number, baseZoom: number): number {
  return t >= T.impact && t < T.returnStart ? baseZoom + 0.5 : baseZoom;
}

/** A ground circle the intro lights up: world px center, radius in tiles. */
export interface LitArea extends Vec2 {
  r: number;
}

/**
 * Ground the fireball lights this frame: a spot under the meteor that
 * widens as it comes down, then the crater until the camera has left.
 */
export function introLitAreas(t: number, nest: Vec2, impact: Vec2): LitArea[] {
  const ground = meteorGround(t, nest, impact);
  if (ground) return [{ ...ground, r: 3 + Math.round(3 * (meteorProgress(t) ?? 0)) }];
  if (t >= T.impact && t < T.returnStart + 0.6) return [{ x: impact.x, y: impact.y, r: 8 }];
  return [];
}

/** Peak shake in screen px, and how many discrete jolts per second. */
const SHAKE_MAX = 20;
const SHAKE_RATE = 30;

/** Snap to whole art pixels (2 screen px); `|| 0` drops a negative zero. */
const toArtPx = (v: number): number => Math.round(v / 2) * 2 || 0;

/**
 * Screen-shake offset at time `t`: a fresh direction every jolt, amplitude
 * falling off quadratically, in even pixels so the world never lands between
 * art pixels. Zero before the impact and once the shake has settled.
 */
export function shakeOffset(t: number): Vec2 {
  const s = t - T.impact;
  const d = T.shakeDuration;
  if (s < 0 || s >= d) return { x: 0, y: 0 };
  const step = Math.floor(s * SHAKE_RATE);
  const amp = SHAKE_MAX * (1 - step / (SHAKE_RATE * d)) ** 2;
  const a = hash2(step, 977) * Math.PI * 2;
  return { x: toArtPx(Math.cos(a) * amp), y: toArtPx(Math.sin(a) * amp) };
}

/** The white impact flash lasts exactly two rendered frames: full white, then a strong half. */
const FLASH_ALPHAS = [1, 0.7] as const;

export function flashAlpha(framesSinceImpact: number): number {
  return FLASH_ALPHAS[framesSinceImpact] ?? 0;
}

/** Warm (fireball orange) wash that follows the white flash, in three steps. */
export function impactGlowAlpha(t: number): number {
  const s = t - T.impact;
  if (s < 0.03 || s >= 0.4) return 0;
  return s < 0.15 ? 0.35 : s < 0.27 ? 0.2 : 0.1;
}

/** Shockwave ring growth 0..1 after the impact; null outside it. */
export function shockwaveProgress(t: number): number | null {
  // Compare absolute times: `t - impact` can round just under the duration
  if (t < T.impact || t >= T.impact + T.shockwaveDuration) return null;
  return (t - T.impact) / T.shockwaveDuration;
}

export const EJECTA_COUNT = 28;

export interface Ejecta extends Vec2 {
  /** Height above the ground (world px) */
  alt: number;
  /** 0..1 through its flight; hot chunks cool as it rises */
  age: number;
}

/** Chunk `i` of the debris the impact throws out: a parabola out of the crater. Null once it has landed. */
export function ejectaChunk(i: number, t: number, impact: Vec2): Ejecta | null {
  const s = t - T.impact;
  const life = 0.7 + hash2(i, 71) * 0.4;
  if (s < 0 || s >= life) return null;
  const f = s / life;
  const a = hash2(i, 83) * Math.PI * 2;
  const reach = 70 + hash2(i, 97) * 170;
  const along = 20 + reach * (1 - (1 - f) ** 2);
  return {
    x: impact.x + Math.cos(a) * along,
    y: impact.y + Math.sin(a) * along,
    alt: 4 * (40 + hash2(i, 89) * 90) * f * (1 - f),
    age: f,
  };
}

/** Crystal spires that grow out of the crater rim and stay there. */
export const SPIRE_COUNT = 7;

/** Spire `i`'s height 0..1, in eighths so it pushes up in pixel steps; 1 once grown. */
export function spireGrowth(i: number, t: number): number {
  const start = T.spireStart + i * T.spireStagger;
  if (t < start) return 0;
  const f = (t - start) / T.spireGrow;
  if (f >= 1) return 1;
  return Math.floor(easeOutCubic(f) * 8) / 8;
}

/** The cyan pulse that rings out of the crater, 0..1; null outside it. */
export function crystalPulseProgress(t: number): number | null {
  if (t < T.pulseStart || t >= T.pulseStart + T.pulseDuration) return null;
  return (t - T.pulseStart) / T.pulseDuration;
}

export const DRONE_COUNT = 4;
/** Drone frames, by the state of its energy core: 0 dormant, 1 waking, 2 lit, 3 bright (the lit core throbs 2 ↔ 3). */
export type DroneFrame = 0 | 1 | 2 | 3;
export const DRONE_FRAME_COUNT = 4;

/**
 * Hovering, in world px: the gap under a drone once it is up, and how far
 * its bob moves it up and down; one bob takes `bobPeriod` seconds.
 */
export const DRONE_HOVER = { lift: 10, bob: 4, bobPeriod: 1.32 } as const;
/** The bob in art px: a stepped sine, one step every bobPeriod / 12 s. */
const BOB_STEPS = [0, 1, 1, 2, 2, 1, 0, -1, -1, -2, -2, -1] as const;

export interface DroneState extends Vec2 {
  /** World px between the crystal's lower tip and its ground point (x, y): the rise plus the bob */
  lift: number;
  /** How much of the crystal has pushed up out of the crater floor, in eighths; 1 once it is out */
  emerge: number;
  frame: DroneFrame;
  /** 0: shards docked against the body; 1: out on their orbit ring */
  spread: number;
  /** Orbit phase of the shards (radians) */
  orbit: number;
  /** Moving toward the colony: it leaves a light trail */
  gliding: boolean;
  /** The hex shield flashes on for a moment as the drone opens */
  shieldFlash: boolean;
}

/** Drones fan out toward the colony's side of the crater. */
const DRONE_FAN = [-0.75, -0.25, 0.25, 0.75] as const;
/** World px from the impact: where they rise in the bowl, and where their glide ends. */
const DRONE_RISE_REACH = 30;
const DRONE_GLIDE_REACH = 130;
/** The bowl is drawn squashed (seen from above at an angle), so rise spots are too. */
const BOWL_TILT = 0.7;
/** The shards go once around the core every this many seconds. */
const ORBIT_PERIOD = 1.6;

const easeOutQuad = (f: number): number => 1 - (1 - f) ** 2;
const droneStartTime = (i: number): number => T.droneStart + i * T.droneStagger;
/** Intro time drone `i` reaches hover height. */
const droneHoverTime = (i: number): number => droneStartTime(i) + T.droneEmerge + T.droneRise;

/**
 * Drone `i`'s hover bob at intro time `t`, in world px (positive = up),
 * snapped to whole art px. It starts at 0 the moment the drone reaches hover
 * height, so the rise flows into the bob, and the stagger keeps the drones
 * out of step.
 */
export function droneBob(i: number, t: number): number {
  const n = BOB_STEPS.length;
  const step = Math.floor(((t - droneHoverTime(i)) / DRONE_HOVER.bobPeriod) * n);
  return BOB_STEPS[((step % n) + n) % n] * 2;
}

/**
 * Crystal drone `i` at intro time `t`: its ground point (world px) and how
 * it floats. It pushes up out of the crater floor, lifts straight up to
 * hover height, wakes its core and swings its shards out into orbit, then
 * glides out past the rim toward the colony, bobbing above its shadow, and
 * hovers there. Purely visual, gone once the camera is home.
 */
export function droneState(i: number, t: number, impact: Vec2, nest: Vec2): DroneState | null {
  const start = droneStartTime(i);
  if (t < start || t >= T.returnEnd) return null;
  const toNest = Math.atan2(nest.y - impact.y, nest.x - impact.x);
  const fan = DRONE_FAN[i % DRONE_FAN.length];
  // Rise spots spread twice as wide as the glide headings, so the drones do not stack in the bowl
  const riseAngle = toNest + fan * 2;
  const from = {
    x: impact.x + Math.cos(riseAngle) * DRONE_RISE_REACH,
    y: impact.y + Math.sin(riseAngle) * DRONE_RISE_REACH * BOWL_TILT,
  };
  const reach = DRONE_GLIDE_REACH + hash2(i, 131) * 40;
  const to = { x: impact.x + Math.cos(toNest + fan) * reach, y: impact.y + Math.sin(toNest + fan) * reach };

  const s = t - start;
  const up = T.droneEmerge + T.droneRise;
  const open = up + T.droneUnfold;
  const state: DroneState = {
    ...from,
    lift: DRONE_HOVER.lift + droneBob(i, t),
    emerge: 1,
    frame: Math.floor(t * 2.5) % 2 === 0 ? 2 : 3,
    spread: 1,
    orbit: (Math.max(0, s - up) / ORBIT_PERIOD) * Math.PI * 2,
    gliding: false,
    shieldFlash: s >= up + T.droneUnfold * (2 / 3) && s < open + 0.2,
  };
  if (s < T.droneEmerge) {
    // Tip first, in eighths, the way the spires push up
    return { ...state, lift: 0, emerge: Math.max(1, Math.floor(easeOutCubic(s / T.droneEmerge) * 8)) / 8, frame: 0, spread: 0 };
  }
  if (s < up) {
    return { ...state, lift: toArtPx(DRONE_HOVER.lift * easeOutCubic((s - T.droneEmerge) / T.droneRise)), frame: 0, spread: 0 };
  }
  if (s < open) {
    const f = (s - up) / T.droneUnfold;
    // The shards swing out in quarter steps while the core wakes
    return { ...state, frame: Math.min(2, Math.floor(f * 3)) as DroneFrame, spread: Math.floor(easeOutCubic(f) * 4) / 4 };
  }
  if (s < open + T.droneGlide) {
    return { ...state, ...lerp(from, to, easeOutQuad((s - open) / T.droneGlide)), gliding: true };
  }
  return { ...state, ...to };
}

export const SHARD_COUNT = 2;
/**
 * World px: how far from the core the shards dock against the body, and the
 * radii of their orbit ring (tilted, as the ground is seen from above).
 */
export const SHARD_ORBIT = { dock: 8, rx: 22, ry: 8 } as const;

export interface ShardOffset {
  /** World px from the drone's core, in whole art px */
  dx: number;
  dy: number;
  /** On the far half of the ring: drawn behind the body */
  behind: boolean;
}

/**
 * Shard `k` of a drone whose shards are `spread` (0 docked, 1 in orbit) at
 * orbit phase `orbit`. Docked shards hug the body's sides level with the
 * core; unfolding widens the ring, and the two ride opposite each other.
 */
export function shardOffset(k: number, spread: number, orbit: number): ShardOffset {
  const a = orbit + k * Math.PI;
  const rx = SHARD_ORBIT.dock + (SHARD_ORBIT.rx - SHARD_ORBIT.dock) * spread;
  const dx = toArtPx(Math.cos(a) * rx);
  const dy = toArtPx(Math.sin(a) * SHARD_ORBIT.ry * spread);
  return { dx, dy, behind: dy < 0 };
}

export interface TrailPoint extends Vec2 {
  /** The drone's lift back then, so the trail glows at core height */
  lift: number;
  /** 0..1, older points further back and fainter */
  age: number;
}

const TRAIL_POINTS = 8;
const TRAIL_GAP = 0.04;

/** The faint light trail drone `i` leaves at time `t`: where it was while gliding, newest first. */
export function droneTrail(i: number, t: number, impact: Vec2, nest: Vec2): TrailPoint[] {
  const out: TrailPoint[] = [];
  if (!droneState(i, t, impact, nest)) return out;
  for (let k = 1; k <= TRAIL_POINTS; k++) {
    const d = droneState(i, t - k * TRAIL_GAP, impact, nest);
    if (d?.gliding) out.push({ x: d.x, y: d.y, lift: d.lift, age: k / TRAIL_POINTS });
  }
  return out;
}

export const SPORE_COUNT = 72;

export interface SporeMote {
  x: number;
  y: number;
  alpha: number;
  bright: boolean;
}

/**
 * Spore mote `i` at time `t`, in world px. Motes appear in a band on the
 * impact side of the colony and funnel toward the nest, staggered so the
 * drift reads as a slow stream rather than a burst.
 */
export function sporeMote(i: number, t: number, nest: Vec2, impact: Vec2): SporeMote | null {
  const { sporeStart, sporeEnd } = T;
  if (t < sporeStart || t >= sporeEnd) return null;
  const stagger = 1.4;
  const born = sporeStart + hash2(i, 101) * stagger;
  const maxLife = sporeEnd - sporeStart - stagger;
  const life = 1.6 + hash2(i, 202) * (maxLife - 1.6);
  const age = t - born;
  if (age < 0 || age >= life) return null;

  let dx = impact.x - nest.x;
  let dy = impact.y - nest.y;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;

  const start = 150 + hash2(i, 303) * 420; // world px out from the nest
  const speed = 70 + hash2(i, 505) * 60;
  const along = Math.max(30, start - speed * age);
  const lateral = (hash2(i, 404) - 0.5) * 520 * (1 - 0.5 * (age / life)) + Math.sin(age * 3.1 + i) * 10;

  return {
    x: nest.x + dx * along - dy * lateral,
    y: nest.y + dy * along + dx * lateral - age * 8,
    alpha: age < 0.3 || life - age < 0.4 ? 0.5 : 1,
    bright: i % 3 === 0,
  };
}

/** Title card alpha: four steps in, hold, four steps out. Never a smooth fade. */
export function titleAlpha(t: number): number {
  const { titleStart: a, titleEnd: b, titleFade: f } = T;
  if (t < a || t >= b) return 0;
  const edge = Math.min(t - a, b - t) / f;
  return edge >= 1 ? 1 : Math.floor(edge * 4) / 4;
}

/** Crater cracks breathe through dim → mid → bright → mid, 0.6 s a step. */
const CRACK_PULSE = [0, 1, 2, 1] as const;

export function crackPulseStep(time: number): 0 | 1 | 2 {
  const period = 2.4;
  const phase = ((time % period) + period) % period;
  return CRACK_PULSE[Math.min(3, Math.floor(phase / (period / 4)))];
}
