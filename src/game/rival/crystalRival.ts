// The full Crystal Hive rival, pure rules: unit and spire stats, the mineral
// economy, the scripted build order, production speed, raids and expansions.
// No World and no randomness: the same clock always grows the same hive.
// CrystalRivalSystem applies these to the world.

import type { Vector2 } from '../../shared/types';
import type { CrystalStructureKind, CrystalUnitKind } from '../components/components';
import { CRYSTAL_DRONE_STATS } from './crystalHive';

export type { CrystalStructureKind, CrystalUnitKind };

export interface CrystalUnitStats {
  health: number;
  shield: number;
  /** Shield points per second once out of combat */
  shieldRegen: number;
  damage: number;
  attackCooldown: number;
  /** Tiles; above MELEE_REACH the unit fires a (visual-only) energy bolt */
  attackRange: number;
  /** Tiles per second */
  speed: number;
  visionRange: number;
  /** Render radius in tiles */
  size: number;
  /** Minerals to crystallize one (0: scripted, never bought) */
  cost: number;
}

/** A hit from farther than this is a ranged shot */
export const MELEE_REACH = 2;

/**
 * Tier 1-3 of the Crystal Hive. Few, slow, strong and expensive: the P4 table
 * puts a drone at 3× a Swarm unit's cost. Starting points for playtests.
 */
export const CRYSTAL_UNIT_STATS: Readonly<Record<CrystalUnitKind, CrystalUnitStats>> = {
  drone: {
    health: CRYSTAL_DRONE_STATS.health,
    shield: 80,
    shieldRegen: 8,
    damage: CRYSTAL_DRONE_STATS.damage,
    attackCooldown: CRYSTAL_DRONE_STATS.attackCooldown,
    attackRange: CRYSTAL_DRONE_STATS.attackRange,
    speed: CRYSTAL_DRONE_STATS.speed,
    visionRange: CRYSTAL_DRONE_STATS.visionRange,
    size: CRYSTAL_DRONE_STATS.size,
    cost: 100,
  },
  sentinel: {
    health: 160,
    shield: 120,
    shieldRegen: 10,
    damage: 14,
    attackCooldown: 1.6,
    attackRange: 4.5,
    speed: 1.0,
    visionRange: 8,
    size: 0.6,
    cost: 150,
  },
  queen: {
    health: 2400,
    shield: 1200,
    shieldRegen: 25,
    damage: 40,
    attackCooldown: 2,
    attackRange: 1.8,
    speed: 0.9,
    visionRange: 9,
    size: 1.1,
    cost: 0,
  },
};

/** The Crystal Queen's aura and her crystal pulse */
export const CRYSTAL_QUEEN_POWERS = {
  /** Crystal allies this close refill their shields faster, even mid-fight */
  auraRadius: 5,
  auraRegenMult: 3,
  /** Every `pulseCooldown` s, enemies within `pulseRadius` take `pulseDamage` */
  pulseCooldown: 6,
  pulseRadius: 3,
  pulseDamage: 25,
} as const;

/** The hive core's own shield */
export const CRYSTAL_HIVE_SHIELD = { max: 500, regen: 15, delay: 6 } as const;

/** A spire: a crystal tower that grows a floor at a time */
export const CRYSTAL_SPIRE_STATS = {
  health: 450,
  shield: 150,
  shieldRegen: 8,
  /** Extra hull per floor above the first */
  healthPerFloor: 150,
  size: 0.9,
} as const;

export const CRYSTAL_MAX_FLOORS = 3;

/** What each spire crystallizes, and how long one takes on a single floor */
export const SPIRE_PRODUCTION: Readonly<Record<CrystalStructureKind, { unit: CrystalUnitKind | null; interval: number }>> = {
  forge: { unit: 'drone', interval: 50 },
  prism: { unit: 'sentinel', interval: 70 },
  extractor: { unit: null, interval: Infinity },
};

/** Seconds per unit for a spire with `floors` floors: each floor adds one more production line */
export function spireInterval(kind: CrystalStructureKind, floors: number): number {
  const base = SPIRE_PRODUCTION[kind].interval;
  if (!Number.isFinite(base)) return Infinity;
  return base / Math.max(1, Math.min(CRYSTAL_MAX_FLOORS, Math.floor(floors)));
}

/**
 * The rival's economy. It eats nothing organic: meteor energy trickles in by
 * itself, and every extractor harvests the mineral nodes around it (the same
 * nodes the player's miners want), until they run dry.
 */
export const CRYSTAL_ECONOMY = {
  startBank: 100,
  /** Minerals per second from the meteorite, always */
  passiveIncome: 0.8,
  /** Minerals per second each extractor drains from nearby nodes */
  extractorRate: 1.2,
  /** Nodes within this many tiles of an extractor feed it */
  extractorRadius: 4,
  /** Minerals per second each raider siphons from a player field */
  raidSiphonRate: 2,
  /** Seconds raiders stay on a field before they go home */
  raidSiphonSeconds: 15,
  /** Raiders siphon nodes within this many tiles */
  raidSiphonRadius: 2.5,
} as const;

export interface BuildStep {
  /** Earliest day (1-based) the step may start: the build order scales by night */
  day: number;
  type: 'build' | 'floor';
  kind: CrystalStructureKind;
  cost: number;
  /** Extractors: on the crater's own field, or an expansion to the nearest free field */
  site?: 'crater' | 'expansion';
}

/** The scripted build order, StarCraft AI style: same order every run, gated by the night. */
export const CRYSTAL_BUILD_ORDER: readonly BuildStep[] = [
  { day: 1, type: 'build', kind: 'extractor', site: 'crater', cost: 75 },
  { day: 1, type: 'build', kind: 'forge', cost: 150 },
  { day: 2, type: 'build', kind: 'prism', cost: 200 },
  { day: 3, type: 'build', kind: 'extractor', site: 'expansion', cost: 150 },
  { day: 3, type: 'floor', kind: 'forge', cost: 125 },
  { day: 4, type: 'floor', kind: 'prism', cost: 175 },
  { day: 5, type: 'build', kind: 'forge', cost: 150 },
  { day: 5, type: 'build', kind: 'extractor', site: 'expansion', cost: 150 },
  { day: 6, type: 'floor', kind: 'prism', cost: 175 },
  { day: 6, type: 'floor', kind: 'forge', cost: 125 },
  { day: 7, type: 'build', kind: 'prism', cost: 200 },
];

export interface RivalBuildState {
  /** Index of the next step in CRYSTAL_BUILD_ORDER */
  next: number;
  /** Minerals banked */
  bank: number;
}

export interface StandingStructure {
  kind: CrystalStructureKind;
  floors: number;
}

export interface BuildAction {
  type: 'build' | 'floor';
  kind: CrystalStructureKind;
  site?: 'crater' | 'expansion';
  cost: number;
}

/**
 * The next build the hive starts, if any: the next step once its day has come
 * and the bank can pay. A floor goes on the first standing spire of its kind
 * with room; when none stands (the player broke it), it raises a new one.
 */
export function nextBuildAction(
  state: RivalBuildState,
  day: number,
  standing: readonly StandingStructure[],
): { action: BuildAction | null; state: RivalBuildState } {
  const step = CRYSTAL_BUILD_ORDER[state.next];
  if (!step || day < step.day || state.bank < step.cost) return { action: null, state };
  const roomForFloor = standing.some((s) => s.kind === step.kind && s.floors < CRYSTAL_MAX_FLOORS);
  const type = step.type === 'floor' && !roomForFloor ? 'build' : step.type;
  const action: BuildAction = { type, kind: step.kind, cost: step.cost, ...(step.site ? { site: step.site } : {}) };
  return { action, state: { next: state.next + 1, bank: state.bank - step.cost } };
}

/** Units the hive keeps at home before production waits: grows with the night */
export function rivalGarrisonCap(day: number): number {
  return Math.min(10, 3 + Math.max(1, Math.floor(day)));
}

/**
 * Raiders the hive sends at the player's miners on `day`: none on day 1,
 * then 1, 2, 2, 3, 3, 4. At least one unit always stays home.
 */
export function raidSize(day: number, garrison: number): number {
  if (!(day >= 2)) return 0;
  const wanted = 1 + Math.floor((Math.floor(day) - 1) / 2);
  return Math.max(0, Math.min(wanted, garrison - 1));
}

/** Raids leave once a day, when this much of the day is left (seconds) */
export const RAID_AT_DAY_REMAINING = 75;

/** The nearest field center the hive does not hold yet (ties: the first listed) */
export function pickExpansionSite(hive: Vector2, fields: readonly Vector2[], taken: readonly Vector2[]): Vector2 | null {
  let best: Vector2 | null = null;
  let bestDist = Infinity;
  for (const field of fields) {
    if (taken.some((t) => t.x === field.x && t.y === field.y)) continue;
    const dist = Math.hypot(field.x - hive.x, field.y - hive.y);
    if (dist < bestDist) {
      best = field;
      bestDist = dist;
    }
  }
  return best ? { x: best.x, y: best.y } : null;
}
