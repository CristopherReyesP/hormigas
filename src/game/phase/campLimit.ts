// No camping on the nest. A hunter that stands by the colony's entrance kills
// the ants one by one as they come out, and the colony can never recover. So
// every hunter keeps a tally of the time it spends near the entrance: with no
// prey in sight it soon loses interest, and even while it feeds it has had
// enough after a while. Then it withdraws, far from the nest, and for some
// time only bites what comes right up to it.

import type { Vector2 } from '../../shared/types';
import type { TileBounds } from '../../simulation/world/frontier';

export const CAMP = {
  /** Within this many tiles of the colony a hunter counts as on the nest */
  radius: 9,
  /** Seconds on the nest with no prey in sight before it loses interest */
  idlePatience: 5,
  /** Seconds on the nest, prey or not, before it has had enough */
  limit: 25,
  /** Seconds it then stays away */
  withdrawSeconds: 50,
  /** Withdrawn, it still bites what comes this close (tiles) */
  defendRange: 5,
  /** How far from the colony it goes to wait (tiles) */
  retreatDistance: 28,
} as const;

/** The tally, kept on the creature */
export interface CampState {
  /** Seconds spent on the nest lately */
  camp?: number;
  /** Seconds on the nest with nothing to hunt */
  campIdle?: number;
  /** Seconds left away from the nest */
  withdraw?: number;
  /** Where it waits while withdrawn */
  retreatAt?: Vector2;
}

/**
 * Advance the tally by `dt`. `distance` is how far the hunter is from the
 * colony, `hasPrey` whether it has something to hunt. Returns 'start' on the
 * tick it withdraws, 'away' while it stays away, 'hunt' otherwise.
 */
export function tickCamp(state: CampState, distance: number, hasPrey: boolean, dt: number): 'hunt' | 'start' | 'away' {
  if (state.withdraw !== undefined) {
    state.withdraw -= dt;
    if (state.withdraw > 0) return 'away';
    state.withdraw = undefined;
    state.retreatAt = undefined;
    state.camp = 0;
    state.campIdle = 0;
    return 'hunt';
  }
  if (distance > CAMP.radius) {
    // Away from the nest the tally runs down
    state.camp = Math.max(0, (state.camp ?? 0) - dt);
    state.campIdle = 0;
    return 'hunt';
  }
  state.camp = (state.camp ?? 0) + dt;
  state.campIdle = hasPrey ? 0 : (state.campIdle ?? 0) + dt;
  if (state.camp < CAMP.limit && state.campIdle < CAMP.idlePatience) return 'hunt';
  state.withdraw = CAMP.withdrawSeconds;
  return 'start';
}

/**
 * Where a hunter at `from` goes to wait: `retreatDistance` tiles from the
 * colony, on its own side of it, inside `bounds`. Tries the sides too when
 * that tile is no ground; null when none is.
 */
export function retreatPoint(
  from: Vector2,
  colony: Vector2,
  bounds: TileBounds,
  walkable: (x: number, y: number) => boolean,
  rng: () => number = Math.random,
): Vector2 | null {
  const dx = from.x - colony.x;
  const dy = from.y - colony.y;
  const base = Math.hypot(dx, dy) > 0.5 ? Math.atan2(dy, dx) : rng() * Math.PI * 2;
  for (const turn of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.4, -2.4, Math.PI]) {
    for (const reach of [1, 0.8, 0.6]) {
      const x = Math.round(Math.min(bounds.x1 - 1, Math.max(bounds.x0 + 1, colony.x + Math.cos(base + turn) * CAMP.retreatDistance * reach)));
      const y = Math.round(Math.min(bounds.y1 - 1, Math.max(bounds.y0 + 1, colony.y + Math.sin(base + turn) * CAMP.retreatDistance * reach)));
      if (Math.hypot(x - colony.x, y - colony.y) <= CAMP.radius + 2) continue;
      if (walkable(x, y)) return { x, y };
    }
  }
  return null;
}
