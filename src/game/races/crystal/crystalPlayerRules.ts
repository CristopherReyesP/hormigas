// The Crystal Hive as the PLAYER's race (P10), pure rules: what it starts with,
// what its structures and units cost and take, the supply cap, the production
// queue and the economy. No World and no randomness. CrystalPlayerSystem
// applies these to the world; the AI rival keeps its own table (rival/crystalRival).

import type { CrystalStructureKind } from '../../components/components';
import { CRYSTAL_MAX_FLOORS } from '../../rival/crystalRival';

/** What the player can raise: the extractor and the two production spires */
export type CrystalBuildKind = CrystalStructureKind;

/** What the player's spires crystallize (the Crystal Queen is the AI's boss only) */
export type CrystalPlayerUnitKind = 'drone' | 'sentinel';

/** The run's opening: the Hive at the map center, two drones and a mineral stock */
export const CRYSTAL_PLAYER_START = {
  minerals: 300,
  drones: 2,
} as const;

/**
 * The player's economy. Nothing organic: the Hive draws a small trickle of
 * meteor energy by itself, and each finished extractor drains the mineral
 * nodes around it into the bank until they run dry.
 */
export const CRYSTAL_PLAYER_ECONOMY = {
  /**
   * Minerals per second from the Hive, always. Balance pass: at 1 a Hive with
   * two extractors earned ~5/s, could not replace what a raid destroyed and
   * stalled at 8-9 units by night 6 against the Humans.
   */
  hiveTrickle: 2,
  /** Minerals per second each finished extractor drains */
  extractorRate: 2,
  /** Nodes this close to an extractor feed it */
  extractorRadius: 4,
} as const;

export interface CrystalStructureDef {
  cost: number;
  /** Seconds to crystallize */
  buildTime: number;
  /** Supply the finished structure adds (per floor for spires) */
  supply: number;
}

export const CRYSTAL_STRUCTURES: Readonly<Record<CrystalBuildKind, CrystalStructureDef>> = {
  extractor: { cost: 75, buildTime: 20, supply: 0 },
  forge: { cost: 150, buildTime: 30, supply: 4 },
  prism: { cost: 200, buildTime: 40, supply: 4 },
};

/** Añadir piso: one more floor on a spire, one more production line and more supply */
export const CRYSTAL_FLOOR = { cost: 125, buildTime: 25 } as const;

export interface CrystalUnitDef {
  cost: number;
  /** Seconds on a one-floor spire */
  time: number;
  supply: number;
  /** The spire that crystallizes it */
  spire: CrystalBuildKind;
}

export const CRYSTAL_PLAYER_UNITS: Readonly<Record<CrystalPlayerUnitKind, CrystalUnitDef>> = {
  drone: { cost: 100, time: 20, supply: 2, spire: 'forge' },
  sentinel: { cost: 150, time: 30, supply: 3, spire: 'prism' },
};

/** Supply the Hive provides by itself */
export const CRYSTAL_HIVE_SUPPLY = 10;
/** No more supply than this, however many floors stand */
export const CRYSTAL_MAX_SUPPLY = 60;
/** Units waiting in one spire's queue, the one in production included */
export const CRYSTAL_QUEUE_MAX = 5;
/** Spires grow only within this many tiles of the Hive or of a finished spire */
export const CRYSTAL_POWER_RADIUS = 12;
/** The Hive defends itself: an energy bolt at the nearest enemy in range */
export const CRYSTAL_HIVE_DEFENSE = { damage: 20, cooldown: 1.5, range: 6 } as const;
/** Structures start at this share of their hull and grow to full as they crystallize */
export const CONSTRUCTION_START_HEALTH = 0.1;

/** What a spire of `kind` crystallizes; null for the extractor */
export function unitForSpire(kind: CrystalBuildKind): CrystalPlayerUnitKind | null {
  if (kind === 'forge') return 'drone';
  if (kind === 'prism') return 'sentinel';
  return null;
}

/** Seconds one `unit` takes on a spire with `floors` floors: each floor is one more production line */
export function productionTime(unit: CrystalPlayerUnitKind, floors: number): number {
  const lines = Math.max(1, Math.min(CRYSTAL_MAX_FLOORS, Math.floor(floors)));
  return CRYSTAL_PLAYER_UNITS[unit].time / lines;
}

export interface StandingStructure {
  kind: CrystalBuildKind;
  floors: number;
  /** Finished crystallizing (a structure still growing adds nothing yet) */
  complete: boolean;
}

/** The supply cap: the Hive's own, plus every floor of every finished spire, up to the maximum. */
export function supplyCap(hiveAlive: boolean, structures: readonly StandingStructure[]): number {
  if (!hiveAlive) return 0;
  let cap = CRYSTAL_HIVE_SUPPLY;
  for (const s of structures) {
    if (!s.complete) continue;
    cap += CRYSTAL_STRUCTURES[s.kind].supply * Math.max(1, s.floors);
  }
  return Math.min(CRYSTAL_MAX_SUPPLY, cap);
}

/** Supply taken by these units */
export function supplyUsed(units: readonly CrystalPlayerUnitKind[]): number {
  return units.reduce((sum, kind) => sum + CRYSTAL_PLAYER_UNITS[kind].supply, 0);
}

export interface QueueState {
  /** Paid units in order; the first is the one crystallizing */
  queue: CrystalPlayerUnitKind[];
  /** Seconds the first one has crystallized so far */
  progress: number;
}

export interface QueueStep {
  state: QueueState;
  /** The unit finished this step, if any */
  done: CrystalPlayerUnitKind | null;
  /** Why the first unit waits: the supply cap is full */
  blocked: 'supply' | null;
}

/**
 * Advance a spire's queue by `dt`. The first unit crystallizes only while
 * `supplyFree` covers it; at the supply cap it waits, ready, until a unit
 * dies or a floor goes up. One unit at most finishes per step.
 */
export function stepQueue(state: QueueState, dt: number, floors: number, supplyFree: number): QueueStep {
  const head = state.queue[0];
  if (head === undefined) return { state: { queue: [], progress: 0 }, done: null, blocked: null };
  if (supplyFree < CRYSTAL_PLAYER_UNITS[head].supply) return { state, done: null, blocked: 'supply' };
  const progress = state.progress + Math.max(0, dt);
  if (progress < productionTime(head, floors)) return { state: { queue: state.queue, progress }, done: null, blocked: null };
  return { state: { queue: state.queue.slice(1), progress: 0 }, done: head, blocked: null };
}

/**
 * Night waves against the Crystal Hive bring this share of the Swarm's
 * beetles: it has fewer, stronger units. Balance pass: was 0.5; a full Hive
 * (60 supply) still fell by night 11-12 while the Swarm lasted past night 20.
 */
export const CRYSTAL_WAVE_BEETLE_SHARE = 0.35;

/** Beetles a wave of `beetles` (young and full) sends against the Crystal Hive: at least one */
export function crystalWaveBeetles(beetles: number): number {
  if (!(beetles > 0)) return 0;
  return Math.max(1, Math.ceil(beetles * CRYSTAL_WAVE_BEETLE_SHARE));
}
