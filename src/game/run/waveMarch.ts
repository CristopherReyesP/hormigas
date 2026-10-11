// The night wave's march on the surface: the beetles that will break into the
// nest leave the map edge in a column, cross the surface toward the nest
// entrance the scout announced, dig in through its hole and come out at the
// matching underground entrance. Pure rules here (where they come from, where
// the holes are, how fast they march); UndergroundInvasionSystem drives them.

import type { EntityId } from '../../shared/types';

/** A wave unit still on its way in (marching on the surface, besieging a hole, or digging in) */
export const WAVE_MARCH_COMPONENT = 'wave_march';

export interface TilePos {
  x: number;
  y: number;
}

export type MarchPhase = 'marching' | 'siege' | 'digging';

export interface WaveMarchComponent {
  phase: MarchPhase;
  /** The surface hole it marches on (surface tile) */
  hole: TilePos;
  /** The underground entrance that hole leads to (underground tile) */
  entrance: TilePos;
  /** Siege or dig: seconds left */
  timer: number;
  /** The current dig's length, for the shrink-into-the-hole animation */
  duration: number;
  /** A wall it chose to break through instead of going around (null when none) */
  wallId: EntityId | null;
  /** Siege: seconds to the next pound on the mound */
  poundTimer: number;
}

/** March numbers. Starting points for playtests. */
export const MARCH_TUNING = {
  /** The column leaves the edge over at most this many seconds... */
  columnSeconds: 8,
  /** ...a unit every `maxInterval` s for small waves, never faster than `minInterval` */
  maxInterval: 1,
  minInterval: 0.3,
  /** Units march side by side in this many lanes, `laneGap` tiles apart */
  lanes: 3,
  laneGap: 1,
  /** The column head should reach the nest about this many seconds into the night (it lasts 60 s) */
  marchSeconds: 24,
  /** Never more than this many times their walking speed */
  maxSpeedFactor: 3,
  /** Paths wind: the straight distance times this is the expected walk */
  winding: 1.15,
  /** This close to its hole, a unit digs in... */
  digReach: 1.2,
  /** ...for this long (it shrinks into the hole, dirt flying) */
  digSeconds: 1.4,
  /** Units squeeze through one hole this many seconds apart (the rest wait at it) */
  holeGap: 0.9,
  /** It turns on a surface ant this close, or on one biting it this close */
  aggro: 2.5,
  retaliate: 4,
  /** It breaks a defense (Espina, Trampa) this close to it on the way */
  structureAggro: 2.2,
  /** It breaks through a wall when going around is longer than this many extra tiles */
  wallDetour: 8,
  /** How far (tiles) the holes spread across the mound, west to east */
  holeSpread: 3,
} as const;

/**
 * The boss rule: a mini-boss too big for the hole (the Acorazado Colosal)
 * besieges it on the surface. Every few seconds it pounds the mound: every
 * colony unit and defense near the hole takes a hit and part of the nest's
 * stockpile spills. If nothing kills it within `seconds`, it has widened the
 * hole enough to squeeze in, and goes for the queen like the rest.
 */
export const SIEGE_TUNING = {
  /** A unit at least this big (render radius, tiles) cannot fit through a hole */
  minSize: 1,
  seconds: 15,
  poundEvery: 2.5,
  radius: 2.5,
  damage: 18,
  /** Share of the nest's stored food each pound spills */
  spill: 0.08,
} as const;

/** The speed factor key the march sets on a unit (cleared once it is inside) */
export const MARCH_SPEED_KEY = 'march';

const COMPASS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1], [1, 1],
];

/** One of the 8 compass directions as a unit vector, y down: 0 east, 2 north, 4 west, 6 south */
export function compassVector(index: number): TilePos {
  const [x, y] = COMPASS[((Math.floor(index) % 8) + 8) % 8];
  const len = Math.hypot(x, y);
  return { x: x / len, y: y / len };
}

/** The scouted compass direction wave `wave` comes from when no wildlife den points the way */
export function scoutedCompass(wave: number): number {
  return (Math.floor(wave) * 3 + 1) % 8;
}

export interface SurfaceMap {
  readonly width: number;
  readonly height: number;
  isWalkable(x: number, y: number): boolean;
  /** The area the run plays on (inside Phase 1's thorn wall); the whole map without it */
  readonly bounds?: { x0: number; y0: number; x1: number; y1: number };
}

/** The closest walkable tile to (x, y) within `radius` rings, or null */
export function nearestWalkable(map: SurfaceMap, x: number, y: number, radius: number): TilePos | null {
  const inside = (tx: number, ty: number) => tx >= 0 && ty >= 0 && tx < map.width && ty < map.height;
  if (inside(x, y) && map.isWalkable(x, y)) return { x, y };
  for (let r = 1; r <= radius; r++) {
    let best: TilePos | null = null;
    let bestDist = Infinity;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = x + dx;
        const ty = y + dy;
        if (!inside(tx, ty) || !map.isWalkable(tx, ty)) continue;
        const d = Math.hypot(dx, dy);
        if (d < bestDist) {
          bestDist = d;
          best = { x: tx, y: ty };
        }
      }
    }
    if (best) return best;
  }
  return null;
}

/**
 * Where a wave leaves from: the walkable tile on the map edge (one tile in)
 * along the ray from `from` in direction `dir`. If the edge there is water or
 * rock, the closest walkable tile near it, or failing that the first one
 * walking back along the ray.
 */
export function edgePoint(map: SurfaceMap, from: TilePos, dir: TilePos): TilePos {
  const len = Math.hypot(dir.x, dir.y) || 1;
  const ux = dir.x / len;
  const uy = dir.y / len;
  const loX = (map.bounds?.x0 ?? 0) + 1;
  const loY = (map.bounds?.y0 ?? 0) + 1;
  const hiX = (map.bounds?.x1 ?? map.width - 1) - 1;
  const hiY = (map.bounds?.y1 ?? map.height - 1) - 1;
  let t = Infinity;
  if (ux > 1e-9) t = Math.min(t, (hiX - from.x) / ux);
  if (ux < -1e-9) t = Math.min(t, (loX - from.x) / ux);
  if (uy > 1e-9) t = Math.min(t, (hiY - from.y) / uy);
  if (uy < -1e-9) t = Math.min(t, (loY - from.y) / uy);
  if (!Number.isFinite(t) || t < 0) t = 0;
  const clampX = (v: number) => Math.max(loX, Math.min(hiX, Math.round(v)));
  const clampY = (v: number) => Math.max(loY, Math.min(hiY, Math.round(v)));
  const edge = { x: clampX(from.x + ux * t), y: clampY(from.y + uy * t) };
  const near = nearestWalkable(map, edge.x, edge.y, 6);
  if (near) return near;
  for (let back = t; back > 0; back -= 1) {
    const x = clampX(from.x + ux * back);
    const y = clampY(from.y + uy * back);
    if (map.isWalkable(x, y)) return { x, y };
  }
  return { x: Math.round(from.x), y: Math.round(from.y) };
}

/**
 * The surface hole an underground entrance opens at. The nest's entrances
 * all come up through its mound: the holes are laid across it west to east
 * in the same order as the entrances below, so the main shaft (the centre)
 * is the nest tile itself and an entrance dug far east comes up on the
 * mound's east side. Snapped to a walkable tile.
 */
export function surfaceHoleFor(map: SurfaceMap, entrance: TilePos, nest: TilePos, undergroundWidth: number): TilePos {
  const half = undergroundWidth / 2;
  const off = Math.round(((entrance.x + 0.5 - half) / half) * MARCH_TUNING.holeSpread);
  const x = Math.round(nest.x) + off;
  const y = Math.round(nest.y);
  return nearestWalkable(map, x, y, 3) ?? { x: Math.round(nest.x), y };
}

/** The march speed boost that brings the column head to the hole about `marchSeconds` into the night */
export function marchSpeedFactor(distance: number, tilesPerSecond: number): number {
  if (!(tilesPerSecond > 0)) return 1;
  const needed = (distance * MARCH_TUNING.winding) / (MARCH_TUNING.marchSeconds * tilesPerSecond);
  return Math.max(1, Math.min(MARCH_TUNING.maxSpeedFactor, needed));
}

/** Seconds between two units leaving the edge, for a column of `count` */
export function columnInterval(count: number): number {
  return Math.max(MARCH_TUNING.minInterval, Math.min(MARCH_TUNING.maxInterval, MARCH_TUNING.columnSeconds / Math.max(1, count)));
}

/** The tile the `index`th unit of the column appears on: lanes side by side across the march direction */
export function columnSlot(map: SurfaceMap, index: number, origin: TilePos, toward: TilePos): TilePos {
  const dx = toward.x - origin.x;
  const dy = toward.y - origin.y;
  const len = Math.hypot(dx, dy) || 1;
  const lanes = MARCH_TUNING.lanes;
  const lane = (index % lanes) - Math.floor(lanes / 2);
  const x = Math.round(origin.x + (-dy / len) * lane * MARCH_TUNING.laneGap);
  const y = Math.round(origin.y + (dx / len) * lane * MARCH_TUNING.laneGap);
  return nearestWalkable(map, x, y, 3) ?? origin;
}
