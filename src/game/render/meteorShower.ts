// Phase 2's meteor shower, purely visual: fireballs streak down on the real
// impact sites (every rival's new base, each in its own colors, far out on the new ground) and, for the
// drama, a volley more across whatever the player is looking at. Each strike
// flashes, rings out and shakes the view; the real ones leave a scorch.
import { TILE_SIZE } from '../../shared/constants';
import { PAL } from '../../engine/renderer/pixelart/palette';

/** Whose meteor it is: every rival falls in its own colors */
export type MeteorKind = 'crystal' | 'human' | 'legion';

/** [head, body, tail] of each rival's fireball */
const METEOR_COLORS: Record<MeteorKind, readonly [string, string, string]> = {
  crystal: [PAL.crystal.shell[4], PAL.crystal.shell[3], PAL.crystal.shell[2]],
  human: [PAL.meteor[0], PAL.human.steel[4], PAL.meteor[1]],
  legion: [PAL.legion[3], PAL.legion[2], PAL.legion[1]],
};

interface Meteor {
  kind: MeteorKind;
  /** Impact, in world px */
  x: number;
  y: number;
  /** Seconds after the shower starts that it strikes */
  at: number;
  /** A real impact (a base landed there): bigger, and it leaves a scorch */
  real: boolean;
}

/** Seconds a fireball takes to fall */
const FALL = 1.1;
/** Seconds the impact flash and ring last */
const BLAST = 0.7;
/** Seconds the scorch of a real impact stays */
const SCORCH = 45;
/** Decorative fireballs across the view */
const VOLLEY = 16;
/** Seconds the shower lasts at least (it stretches to cover the camera tour) */
const SPAN = 6;
/** Seconds between two real impacts: long enough for the camera to fly to each */
const REAL_GAP = 2.4;
/** The camera arrives this long before a real strike lands, and stays this long after */
const LEAD = 1.0;
const HOLD = 1.1;
/** Where a fireball comes from, relative to its impact (world px): high up and to the left */
const FROM = { x: -7 * TILE_SIZE, y: -12 * TILE_SIZE };

export class MeteorShower {
  private meteors: Meteor[] = [];
  private time = 0;
  private pendingVolley = false;

  /** Start the shower on these impact tiles; the volley across the view is placed on the next draw */
  start(impacts: ReadonlyArray<{ x: number; y: number; kind: MeteorKind }>): void {
    this.time = 0;
    this.meteors = impacts.map((t, i) => ({
      kind: t.kind,
      x: t.x * TILE_SIZE + TILE_SIZE / 2,
      y: t.y * TILE_SIZE + TILE_SIZE / 2,
      at: 1.2 + i * REAL_GAP,
      real: true,
    }));
    this.pendingVolley = true;
  }

  /** How long the shower runs: the decorative minimum or the end of the camera tour */
  private span(): number {
    let last = 0;
    for (const m of this.meteors) if (m.real) last = Math.max(last, m.at + FALL + HOLD);
    return Math.max(SPAN, last);
  }

  advance(dt: number): void {
    if (this.meteors.length === 0) return;
    this.time += dt;
    if (this.time > this.span() + SCORCH) this.meteors = [];
  }

  /**
   * Where the camera should look right now: the real impact about to land (a
   * new rival base arriving), or null once the tour is over.
   */
  focus(): { x: number; y: number } | null {
    for (const m of this.meteors) {
      if (!m.real) continue;
      if (this.time >= m.at - LEAD && this.time < m.at + FALL + HOLD) return { x: m.x, y: m.y };
    }
    return null;
  }

  /** The view shake (px) from the strikes landing now */
  shake(): { x: number; y: number } {
    let power = 0;
    for (const m of this.meteors) {
      const since = this.time - m.at - FALL;
      if (since >= 0 && since < 0.4) power = Math.max(power, (m.real ? 10 : 3) * (1 - since / 0.4));
    }
    if (power === 0) return { x: 0, y: 0 };
    return { x: Math.round(Math.sin(this.time * 91) * power), y: Math.round(Math.cos(this.time * 77) * power) };
  }

  /** Draw in world space; `view` is the world px rect on screen (the volley falls inside it) */
  draw(ctx: CanvasRenderingContext2D, view: { x: number; y: number; w: number; h: number }): void {
    if (this.meteors.length === 0) return;
    if (this.pendingVolley) {
      this.pendingVolley = false;
      for (let i = 0; i < VOLLEY; i++) {
        const kinds = [...new Set(this.meteors.map((m) => m.kind))];
        this.meteors.push({
          kind: kinds[i % Math.max(1, kinds.length)] ?? 'crystal',
          x: view.x + view.w * (0.1 + 0.8 * Math.random()),
          y: view.y + view.h * (0.15 + 0.8 * Math.random()),
          at: Math.random() * (this.span() - FALL),
          real: false,
        });
      }
    }
    const pixel = 2;
    for (const m of this.meteors) {
      const t = this.time - m.at;
      if (t < 0) continue;
      if (t < FALL) {
        // The falling fireball and its trail of embers
        const k = t / FALL;
        const hx = m.x + FROM.x * (1 - k);
        const hy = m.y + FROM.y * (1 - k);
        // A dense trail: overlapping squares shrinking and cooling away from the head
        const steps = m.real ? 22 : 16;
        for (let i = steps; i >= 0; i--) {
          const back = i * 0.02;
          const tx = hx - FROM.x * back;
          const ty = hy - FROM.y * back;
          const [head, body, tail] = METEOR_COLORS[m.kind];
          const color = i < 2 ? head : i < 7 ? body : tail;
          const s = Math.max(pixel, Math.round(((m.real ? 40 : 14) * (1 - i / (steps + 2))) / pixel) * pixel);
          ctx.globalAlpha = Math.max(0.15, 1 - i / steps);
          ctx.fillStyle = color;
          ctx.fillRect(Math.round(tx - s / 2), Math.round(ty - s / 2), s, s);
        }
        ctx.globalAlpha = 1;
        continue;
      }
      const since = t - FALL;
      if (m.real && since < SCORCH) {
        // The scorch: a dark burnt ring with embers, fading out
        ctx.globalAlpha = 0.55 * (1 - since / SCORCH);
        ctx.fillStyle = PAL.crater[0];
        const r = TILE_SIZE * 2.2;
        for (let a = 0; a < 16; a++) {
          const ang = (a / 16) * Math.PI * 2;
          ctx.fillRect(Math.round(m.x + Math.cos(ang) * r * 0.7) - 6, Math.round(m.y + Math.sin(ang) * r * 0.5) - 4, 12, 8);
        }
        ctx.globalAlpha = 1;
      }
      if (since < BLAST) {
        // The flash and the shock ring
        const k = since / BLAST;
        const r = (m.real ? 5.5 : 1.6) * TILE_SIZE * k;
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = METEOR_COLORS[m.kind][0];
        const core = Math.round((m.real ? 48 : 14) * (1 - k));
        ctx.fillRect(Math.round(m.x - core), Math.round(m.y - core), core * 2, core * 2);
        ctx.fillStyle = METEOR_COLORS[m.kind][1];
        for (let a = 0; a < 20; a++) {
          const ang = (a / 20) * Math.PI * 2;
          ctx.fillRect(Math.round(m.x + Math.cos(ang) * r) - pixel * 2, Math.round(m.y + Math.sin(ang) * r * 0.7) - pixel * 2, pixel * 4, pixel * 4);
        }
        ctx.globalAlpha = 1;
      }
    }
  }
}
