// The Humans as an AI rival (P9), pure rules: unit and building stats, armor,
// the passive economy, the scripted build order, what the barracks train and
// what each night wave and day raid sends. No World, no randomness: the same
// inputs always give the same base. HumanBaseSystem and HumanUnitAISystem
// apply these.

import type { EntityId } from '../../shared/types';
import type { TilePos } from '../run/craterSite';

export type HumanUnitType = 'soldier' | 'marksman' | 'tank' | 'builder';
/** The factory only stands in a player's base: the AI's build order never raises one. */
export type HumanBuildingKind = 'command_center' | 'barracks' | 'bunker' | 'supply_depot' | 'factory';

/** Fighting units the barracks train and the waves send (the builder never fights). */
export type HumanTroop = Exclude<HumanUnitType, 'builder'>;

export interface HumanUnitStats {
  /** Rations to train one */
  readonly cost: number;
  /** Supply it takes */
  readonly supply: number;
  /** Seconds a barracks spends on one */
  readonly trainTime: number;
  readonly health: number;
  /** Taken off every hit it takes, down to 1 damage (armoredDamage) */
  readonly armor: number;
  readonly damage: number;
  readonly attackCooldown: number;
  /** Tiles: Humans shoot from range */
  readonly attackRange: number;
  /** Tiles around the target that a shell also hits (0: none) */
  readonly splashRadius: number;
  /** Tiles per second */
  readonly speed: number;
  readonly visionRange: number;
  /** Chases end this far from where the unit saw its prey */
  readonly leashRange: number;
  /** Earliest night the barracks train it and the waves send it */
  readonly minNight: number;
  readonly size: number;
}

/**
 * Tier 1 from the plan's table (soldier: 70 rations, 160 HP, armor 1, 6 per
 * 0.8 s at range 5); marksman and tank are tier 2 and 3. Medium cost (2×
 * the Swarm), medium strength, ranged firearms.
 */
export const HUMAN_UNIT_STATS: Readonly<Record<HumanUnitType, HumanUnitStats>> = {
  soldier: {
    cost: 70, supply: 1, trainTime: 20, health: 160, armor: 1, damage: 6, attackCooldown: 0.8,
    attackRange: 5, splashRadius: 0, speed: 1.6, visionRange: 7, leashRange: 11, minNight: 1, size: 0.45,
  },
  marksman: {
    cost: 100, supply: 1, trainTime: 26, health: 90, armor: 0, damage: 16, attackCooldown: 1.8,
    attackRange: 8, splashRadius: 0, speed: 1.5, visionRange: 10, leashRange: 13, minNight: 2, size: 0.45,
  },
  tank: {
    cost: 250, supply: 3, trainTime: 45, health: 480, armor: 3, damage: 30, attackCooldown: 2.6,
    attackRange: 6.5, splashRadius: 1.6, speed: 0.9, visionRange: 8, leashRange: 12, minNight: 5, size: 0.9,
  },
  builder: {
    cost: 50, supply: 1, trainTime: 25, health: 70, armor: 0, damage: 0, attackCooldown: 1,
    attackRange: 0, splashRadius: 0, speed: 1.8, visionRange: 6, leashRange: 0, minNight: 1, size: 0.4,
  },
};

/** Share of a tank shell's damage that the enemies around its target take. */
export const TANK_SPLASH_SHARE = 0.5;

export interface HumanBuildingStats {
  readonly cost: number;
  /** Seconds the builder spends raising it */
  readonly buildTime: number;
  readonly health: number;
  readonly armor: number;
  /** Floors drawn stacked upward (the Humans build up, not down) */
  readonly floors: number;
  /** Supply it adds */
  readonly supply: number;
  /** A turret's shot; 0 for buildings that do not shoot */
  readonly damage: number;
  readonly attackCooldown: number;
  readonly attackRange: number;
  /** Half the drawn footprint in tiles (clicks anywhere on it hit it) */
  readonly halfWidth: number;
  /** Tiles the roof stands above the base point */
  readonly height: number;
}

export const HUMAN_BUILDING_STATS: Readonly<Record<HumanBuildingKind, HumanBuildingStats>> = {
  command_center: {
    cost: 400, buildTime: 0, health: 1600, armor: 1, floors: 3, supply: 6,
    damage: 0, attackCooldown: 1, attackRange: 0, halfWidth: 1.6, height: 3.4,
  },
  barracks: {
    cost: 150, buildTime: 30, health: 700, armor: 1, floors: 2, supply: 0,
    damage: 0, attackCooldown: 1, attackRange: 0, halfWidth: 1.2, height: 2.4,
  },
  bunker: {
    cost: 100, buildTime: 22, health: 500, armor: 2, floors: 1, supply: 0,
    damage: 8, attackCooldown: 1, attackRange: 6, halfWidth: 1, height: 1.4,
  },
  supply_depot: {
    cost: 100, buildTime: 18, health: 350, armor: 1, floors: 1, supply: 8,
    damage: 0, attackCooldown: 1, attackRange: 0, halfWidth: 0.9, height: 1.2,
  },
  factory: {
    cost: 200, buildTime: 40, health: 900, armor: 1, floors: 2, supply: 0,
    damage: 0, attackCooldown: 1, attackRange: 0, halfWidth: 1.4, height: 2.6,
  },
};

/**
 * Damage after armor: armor comes off every hit, but an armored target never
 * takes less than 1 (StarCraft's rule). Unarmored targets and harmless hits
 * pass through unchanged.
 */
export function armoredDamage(damage: number, armor: number): number {
  if (damage <= 0) return 0;
  if (armor <= 0) return damage;
  return Math.max(1, damage - armor);
}

// ── Economy: passive rations ──

export const HUMAN_ECONOMY = {
  /** Rations in the bank when the run starts */
  startRations: 150,
  /** Rations per second from the command center */
  coreIncome: 2,
  /** Extra rations per second for every finished supply depot (its crops) */
  depotIncome: 0.5,
  /** Seconds the command center needs to train a new builder after the last one died */
  builderRespawn: 30,
} as const;

/** Rations per second with `depots` finished supply depots. */
export function humanIncome(depots: number): number {
  return HUMAN_ECONOMY.coreIncome + HUMAN_ECONOMY.depotIncome * Math.max(0, depots);
}

/** Supply the base has with `depots` finished supply depots. */
export function humanSupplyCap(depots: number): number {
  return HUMAN_BUILDING_STATS.command_center.supply + HUMAN_BUILDING_STATS.supply_depot.supply * Math.max(0, depots);
}

// ── The scripted build order ──

export interface BuildStep {
  readonly kind: HumanBuildingKind;
  /** The step waits for this night (day number) */
  readonly night: number;
}

/**
 * What the builder raises after the starting base (command center, barracks,
 * bunker, supply depot), in order. Each step waits for its night, so the base
 * grows with the run: more bunkers toward the enemy, more barracks (parallel
 * production) and more depots (supply and rations).
 */
export const HUMAN_BUILD_ORDER: readonly BuildStep[] = [
  { kind: 'supply_depot', night: 1 },
  { kind: 'bunker', night: 1 },
  { kind: 'barracks', night: 2 },
  { kind: 'supply_depot', night: 2 },
  { kind: 'bunker', night: 3 },
  { kind: 'supply_depot', night: 3 },
  { kind: 'barracks', night: 4 },
  { kind: 'bunker', night: 4 },
  { kind: 'supply_depot', night: 5 },
  { kind: 'bunker', night: 5 },
  { kind: 'barracks', night: 6 },
  { kind: 'supply_depot', night: 6 },
  { kind: 'bunker', night: 7 },
  { kind: 'bunker', night: 7 },
];

/** The next step once `built` steps are done, or null while it waits for its night or the script is over. */
export function nextBuildStep(built: number, night: number): BuildStep | null {
  const step = HUMAN_BUILD_ORDER[built];
  if (!step || night < step.night) return null;
  return step;
}

/**
 * Building slots around the command center, in tiles. Bunkers take the free
 * slot nearest the enemy nest (a front line); everything else takes the free
 * slot farthest from it (behind the core).
 */
export const HUMAN_BASE_SLOTS: readonly TilePos[] = [
  { x: -4, y: 0 }, { x: 4, y: 0 }, { x: 0, y: -4 }, { x: 0, y: 4 },
  { x: -4, y: -4 }, { x: 4, y: -4 }, { x: -4, y: 4 }, { x: 4, y: 4 },
  { x: -8, y: 0 }, { x: 8, y: 0 }, { x: 0, y: -7 }, { x: 0, y: 7 },
  { x: -7, y: -4 }, { x: -7, y: 4 }, { x: 7, y: -4 }, { x: 7, y: 4 },
  { x: -4, y: -7 }, { x: 4, y: -7 }, { x: -4, y: 7 }, { x: 4, y: 7 },
];

/** The tile for a new `kind` building, or null when every slot is taken or blocked. Ties keep slot order. */
export function pickBuildSlot(
  kind: HumanBuildingKind,
  base: TilePos,
  nest: TilePos,
  taken: readonly TilePos[],
  isWalkable: (x: number, y: number) => boolean,
): TilePos | null {
  const toward = kind === 'bunker';
  let best: TilePos | null = null;
  let bestScore = Infinity;
  for (const slot of HUMAN_BASE_SLOTS) {
    const x = base.x + slot.x;
    const y = base.y + slot.y;
    if (!isWalkable(x, y)) continue;
    if (taken.some((t) => Math.abs(t.x - x) < 2 && Math.abs(t.y - y) < 2)) continue;
    const dist = Math.hypot(x - nest.x, y - nest.y);
    const score = toward ? dist : -dist;
    if (score < bestScore - 1e-9) {
      bestScore = score;
      best = { x, y };
    }
  }
  return best;
}

// ── Production and attacks ──

/** What a barracks trains as its `index`-th unit (0-based, base-wide) on `night`. */
export function pickTrainee(night: number, index: number): HumanTroop {
  if (night >= HUMAN_UNIT_STATS.tank.minNight && index % 6 === 5) return 'tank';
  if (night >= HUMAN_UNIT_STATS.marksman.minNight && index % 3 === 2) return 'marksman';
  return 'soldier';
}

/**
 * The night wave's `count` troops: tanks from night 5 (one per six), marksmen
 * from night 2 (a third of the rest), soldiers fill the squad. Soldiers lead.
 */
export function humanWaveSquad(night: number, count: number): HumanTroop[] {
  const n = Math.max(0, Math.floor(count));
  const tanks = night >= HUMAN_UNIT_STATS.tank.minNight && n > 0 ? Math.min(n, Math.max(1, Math.floor(n / 6))) : 0;
  const marksmen = night >= HUMAN_UNIT_STATS.marksman.minNight ? Math.floor((n - tanks) / 3) : 0;
  const soldiers = n - tanks - marksmen;
  return [
    ...Array<HumanTroop>(soldiers).fill('soldier'),
    ...Array<HumanTroop>(marksmen).fill('marksman'),
    ...Array<HumanTroop>(tanks).fill('tank'),
  ];
}

/** Day progress (0..1) at which the day raid leaves. */
export const HUMAN_RAID_AT = 0.35;
/** Seconds a day raid hunts before it heads home. */
export const HUMAN_RAID_SECONDS = 60;

/** Troops in the day raid on the player's miners and scouts: none on day 1, then a few more every other day. */
export function humanRaidSize(day: number): number {
  if (!Number.isFinite(day) || day < 2) return 0;
  return Math.min(6, 1 + Math.floor(day / 2));
}

export interface TurretCandidate {
  id: EntityId;
  x: number;
  y: number;
}

/**
 * A turret's target: the current one while it stays in range, else the
 * nearest candidate in range (the lowest id on a tie), else null.
 */
export function pickTurretTarget(
  from: { x: number; y: number },
  range: number,
  candidates: readonly TurretCandidate[],
  currentId: EntityId | null,
): EntityId | null {
  let best: TurretCandidate | null = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    const dist = Math.hypot(c.x - from.x, c.y - from.y);
    if (dist > range) continue;
    if (c.id === currentId) return c.id;
    if (dist < bestDist || (dist === bestDist && best !== null && c.id < best.id)) {
      best = c;
      bestDist = dist;
    }
  }
  return best?.id ?? null;
}
