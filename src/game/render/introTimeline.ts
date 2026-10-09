import { hash2 } from '../../engine/renderer/pixelart/palette';

/**
 * Pure timing and motion for the run's opening: a meteorite crosses the sky,
 * hits the far side of the map, shakes the screen, and its spores drift to the
 * colony. Everything here is a function of game time, so pausing holds the
 * intro and tests can sample any moment. MeteorIntro does the drawing.
 */

export interface Vec2 {
  x: number;
  y: number;
}

/** The title card, one line per row of the big pixel font. */
export const INTRO_TITLE_LINES = ['EL ENJAMBRE', 'DESPIERTA'] as const;
export const INTRO_TITLE = INTRO_TITLE_LINES.join(' ');

/** Seconds of game time since the run started. */
export const INTRO_TIMELINE = {
  meteorStart: 0.5,
  impact: 1.7,
  shakeDuration: 0.5,
  shockwaveDuration: 1.8,
  sporeStart: 1.9,
  sporeEnd: 5.8,
  titleStart: 2.2,
  titleEnd: 5.6,
  titleFade: 0.6,
  end: 6.0,
} as const;

/** Skip input is ignored until the title shows, so a focus click cannot hide the meteor. */
export function canSkipIntro(t: number): boolean {
  return t >= INTRO_TIMELINE.titleStart;
}

export type IntroPhase = 'calm' | 'meteor' | 'impact' | 'aftermath' | 'done';

export function introPhase(t: number): IntroPhase {
  const T = INTRO_TIMELINE;
  if (t < T.meteorStart) return 'calm';
  if (t < T.impact) return 'meteor';
  if (t < T.impact + T.shakeDuration) return 'impact';
  if (t < T.end) return 'aftermath';
  return 'done';
}

/** Flight progress 0..1, accelerating as it falls; null outside the flight. */
export function meteorProgress(t: number): number | null {
  const { meteorStart: a, impact: b } = INTRO_TIMELINE;
  if (t < a || t >= b) return null;
  return ((t - a) / (b - a)) ** 1.6;
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
  const s = t - INTRO_TIMELINE.impact;
  const d = INTRO_TIMELINE.shakeDuration;
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
  const s = t - INTRO_TIMELINE.impact;
  if (s < 0.03 || s >= 0.4) return 0;
  return s < 0.15 ? 0.35 : s < 0.27 ? 0.2 : 0.1;
}

/** Shockwave ring growth 0..1 after the impact; null outside it. */
export function shockwaveProgress(t: number): number | null {
  const s = t - INTRO_TIMELINE.impact;
  if (s < 0 || s >= INTRO_TIMELINE.shockwaveDuration) return null;
  return s / INTRO_TIMELINE.shockwaveDuration;
}

/** Title card alpha: four steps in, hold, four steps out. Never a smooth fade. */
export function titleAlpha(t: number): number {
  const { titleStart: a, titleEnd: b, titleFade: f } = INTRO_TIMELINE;
  if (t < a || t >= b) return 0;
  const edge = Math.min(t - a, b - t) / f;
  return edge >= 1 ? 1 : Math.floor(edge * 4) / 4;
}

export interface MeteorPath {
  start: Vec2;
  end: Vec2;
}

/**
 * Screen-space flight line ending at the impact's screen position. The start
 * sits just off-screen roughly opposite the impact, swung 25° toward the top
 * of the screen, so the streak always crosses the view on a diagonal before
 * it disappears toward the far side of the map.
 */
export function meteorScreenPath(end: Vec2, screen: { w: number; h: number }): MeteorPath {
  const cx = screen.w / 2;
  const cy = screen.h / 2;
  let dx = end.x - cx;
  let dy = end.y - cy;
  const len = Math.hypot(dx, dy);
  if (len < 1) { dx = 1; dy = 0; } else { dx /= len; dy /= len; }

  const reach = Math.hypot(cx, cy) + 60; // just past the screen corners
  const swing = (25 * Math.PI) / 180;
  const candidates = [swing, -swing].map((a) => {
    // Opposite of the impact direction, rotated by a
    const ox = -dx * Math.cos(a) + dy * Math.sin(a);
    const oy = -dx * Math.sin(a) - dy * Math.cos(a);
    return { x: cx + ox * reach, y: cy + oy * reach };
  });
  // Prefer the higher start; on a tie (a straight-down fall) come from the left
  candidates.sort((p, q) => (Math.abs(p.y - q.y) > 1e-6 ? p.y - q.y : p.x - q.x));
  return { start: candidates[0], end: { x: end.x, y: end.y } };
}

export function pointOnPath(path: MeteorPath, p: number): Vec2 {
  return {
    x: path.start.x + (path.end.x - path.start.x) * p,
    y: path.start.y + (path.end.y - path.start.y) * p,
  };
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
  const { sporeStart, sporeEnd } = INTRO_TIMELINE;
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

/** Crater cracks breathe through dim → mid → bright → mid, 0.6 s a step. */
const CRACK_PULSE = [0, 1, 2, 1] as const;

export function crackPulseStep(time: number): 0 | 1 | 2 {
  const period = 2.4;
  const phase = ((time % period) + period) % period;
  return CRACK_PULSE[Math.min(3, Math.floor(phase / (period / 4)))];
}
