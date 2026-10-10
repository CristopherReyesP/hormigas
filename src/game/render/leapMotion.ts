// Leap motion for the alien leapers (the neutral cricket). Visual only: the
// gameplay position, speed, pathing and collision are unchanged; the renderer
// draws the leaper planted, then hopping in a short arc to catch up with its
// real position, then planted again.
import { ART_PX } from '../../engine/renderer/sprites/spriteScale';
import type { LeaperPose } from '../../engine/renderer/sprites/wildlifeSprites';
import type { EntityId } from '../../shared/types';

/** Seconds per phase, the arc's peak in world px and the tracker's distance rules in tiles. */
export const LEAP = {
  crouch: 0.12, // squash before take-off
  air: 0.34,
  land: 0.1, // squash on landing
  rest: 0.3, // planted pause before the next hop
  height: 16, // peak lift in world px, whole art pixels
  minHop: 0.15, // real position this far from the planted spot starts a hop
  snap: 4, // farther than this (spawn, teleport) and the drawing just jumps there
  maxLag: 1.2, // past this lag the hop clock runs faster, so fast-forward never strands the drawing
} as const;

export const LEAP_CYCLE = LEAP.crouch + LEAP.air + LEAP.land + LEAP.rest;

export type LeapPhase = 'crouch' | 'air' | 'land' | 'rest';

export interface LeapFrame {
  phase: LeapPhase;
  /** 0 → 1: share of the hop travelled (0 before take-off, 1 after landing). */
  travel: number;
  /** World px above the ground, a whole number of art pixels. */
  lift: number;
  /** Baked sprite pose: crouch is the squash, leap the stretch. */
  pose: LeaperPose;
}

/** The pose at `t` seconds into the hop cycle (wraps every LEAP_CYCLE). */
export function leapFrame(t: number): LeapFrame {
  const c = ((t % LEAP_CYCLE) + LEAP_CYCLE) % LEAP_CYCLE;
  if (c < LEAP.crouch) return { phase: 'crouch', travel: 0, lift: 0, pose: 'crouch' };
  const airT = c - LEAP.crouch;
  if (airT < LEAP.air) {
    const u = airT / LEAP.air;
    const lift = Math.round((4 * LEAP.height * u * (1 - u)) / ART_PX) * ART_PX;
    return { phase: 'air', travel: u, lift, pose: 'leap' };
  }
  if (airT < LEAP.air + LEAP.land) return { phase: 'land', travel: 1, lift: 0, pose: 'crouch' };
  return { phase: 'rest', travel: 1, lift: 0, pose: 'walk' };
}

export interface LeapDraw {
  x: number;
  y: number;
  lift: number;
  pose: LeaperPose;
}

interface LeapState {
  /** Where the leaper is planted (the hop's take-off spot until it lands). */
  atX: number;
  atY: number;
  t: number;
  landed: boolean;
}

/**
 * Per-entity hop state over the live (interpolated) gameplay position, in
 * tiles. A leaper that is not moving stays planted in its rest pose.
 */
export class LeapTracker {
  private states = new Map<EntityId, LeapState>();

  get size(): number {
    return this.states.size;
  }

  step(id: EntityId, x: number, y: number, dt: number): LeapDraw {
    let s = this.states.get(id);
    if (!s || Math.hypot(x - s.atX, y - s.atY) > LEAP.snap) {
      s = { atX: x, atY: y, t: LEAP_CYCLE - restOffset(id), landed: true };
      this.states.set(id, s);
    }

    const lag = Math.hypot(x - s.atX, y - s.atY);
    s.t += dt * Math.max(1, lag / LEAP.maxLag);
    if (s.t >= LEAP_CYCLE) {
      if (lag >= LEAP.minHop) {
        s.t = 0;
        s.landed = false;
      } else {
        s.t = LEAP_CYCLE; // stay planted until it moves
      }
    }

    const f = leapFrame(Math.min(s.t, LEAP_CYCLE - 1e-9));
    if (f.phase === 'crouch' && !s.landed) return { x: s.atX, y: s.atY, lift: 0, pose: f.pose };
    if (f.phase === 'air') {
      return { x: s.atX + (x - s.atX) * f.travel, y: s.atY + (y - s.atY) * f.travel, lift: f.lift, pose: f.pose };
    }
    if (!s.landed) {
      s.atX = x;
      s.atY = y;
      s.landed = true;
    }
    return { x: s.atX, y: s.atY, lift: 0, pose: f.pose };
  }

  /** Drop the state of entities no longer drawn. */
  retain(ids: ReadonlySet<EntityId>): void {
    for (const id of this.states.keys()) {
      if (!ids.has(id)) this.states.delete(id);
    }
  }
}

/** A per-entity slice of the rest pause, so a pack of leapers does not hop in lockstep. */
function restOffset(id: EntityId): number {
  return ((id * 0.618034) % 1) * LEAP.rest;
}
