import { AntRole } from '../components/components';
import {
  ANT_SPEED,
  BREED_COST_DEFENDER,
  BREED_COST_NURSE,
  BREED_COST_SCOUT,
  BREED_COST_SOLDIER,
  BREED_COST_WORKER,
  EGG_FOOD_REQUIRED,
  EGG_INCUBATION_DEFENDER,
  EGG_INCUBATION_NURSE,
  EGG_INCUBATION_SCOUT,
  EGG_INCUBATION_SOLDIER,
  EGG_INCUBATION_WORKER,
  EXCAVATION_TIME,
  HEAL_HP_PER_FOOD,
  MAX_EGGS_PER_INCUBATION_TILE,
  MAX_EGGS_PER_TYPE,
  PANTRY_STORAGE_UPGRADE_PER_TILE,
  PANTRY_TILE_CAPACITY,
  PORTER_MAX_COUNT,
  QUEEN_EGG_LAY_TIME,
  QUEEN_MAX_HEALTH,
  ROLE_STATS,
} from '../../shared/constants';
import type { UpgradeLevels } from './upgradeLevels';
import type { UpgradeId } from './upgradeTable';

/**
 * What each level of each line does, as plain functions of the levels.
 * Systems read these at the point of use (lay time, hatch speed, tile
 * capacity) and antSpawnStats reads the caste multipliers, so a purchase
 * reaches eggs already queued, larvae already incubating and ants already alive.
 */
export const UPGRADE_STEP = {
  /** Seconds off the queen's lay time per level */
  queenLay: 0.4,
  /** Extra queued eggs per caste per level */
  queenQueue: 2,
  queenHp: 150,
  queenArmor: 2,
  /** HP per second per level */
  queenRegen: 1.5,
  /** Larva growth speed per level (+25%) */
  incubationSpeed: 0.25,
  eggsPerTile: 1,
  /** Food a larva needs, less per level */
  larvaFood: 2,
  /** Egg price, less per level (−10%) */
  eggCost: 0.1,
  carry: 0.25,
  soldierDamage: 0.25,
  carapace: 0.2,
  workerHp: 0.25,
  defenderDamage: 0.25,
  speed: 0.1,
  storage: PANTRY_STORAGE_UPGRADE_PER_TILE,
  dig: 0.3,
  porters: 1,
  heal: 0.5,
} as const;

const round2 = (n: number) => Math.round(n * 100) / 100;

// ── Reina ──

export function queenLayTime(levels: UpgradeLevels): number {
  return round2(QUEEN_EGG_LAY_TIME - UPGRADE_STEP.queenLay * levels.queenLay);
}

export function eggQueuePerCaste(levels: UpgradeLevels): number {
  return MAX_EGGS_PER_TYPE + UPGRADE_STEP.queenQueue * levels.queenQueue;
}

export function queenMaxHealth(levels: UpgradeLevels): number {
  return QUEEN_MAX_HEALTH + UPGRADE_STEP.queenHp * levels.queenHp;
}

/** Flat damage off every hit on the queen (the same armor rule as Human units) */
export function queenArmor(levels: UpgradeLevels): number {
  return UPGRADE_STEP.queenArmor * levels.queenHp;
}

export function queenRegen(levels: UpgradeLevels): number {
  return UPGRADE_STEP.queenRegen * levels.queenRegen;
}

/** 0-3: how much the queen's sprite shows off (crown, then gems, then a stronger glow) */
export function queenTier(levels: UpgradeLevels): number {
  const total = levels.queenLay + levels.queenQueue + levels.queenHp + levels.queenRegen;
  if (total >= 9) return 3;
  if (total >= 4) return 2;
  return total > 0 ? 1 : 0;
}

// ── Incubación ──

export const BASE_INCUBATION: Record<AntRole, number> = {
  [AntRole.Worker]: EGG_INCUBATION_WORKER,
  [AntRole.Soldier]: EGG_INCUBATION_SOLDIER,
  [AntRole.Scout]: EGG_INCUBATION_SCOUT,
  [AntRole.Nurse]: EGG_INCUBATION_NURSE,
  [AntRole.Defender]: EGG_INCUBATION_DEFENDER,
};

/** Larva growth per second on an incubation tile */
export function incubationSpeed(levels: UpgradeLevels): number {
  return 1 + UPGRADE_STEP.incubationSpeed * levels.incubation;
}

/** Seconds on an incubation tile before an egg of this caste hatches (no nurse care) */
export function hatchTime(levels: UpgradeLevels, role: AntRole): number {
  return round2(BASE_INCUBATION[role] / incubationSpeed(levels));
}

export function eggsPerIncubationTile(levels: UpgradeLevels): number {
  return MAX_EGGS_PER_INCUBATION_TILE + UPGRADE_STEP.eggsPerTile * levels.incubation;
}

export function larvaFoodRequired(levels: UpgradeLevels): number {
  return EGG_FOOD_REQUIRED - UPGRADE_STEP.larvaFood * levels.nutrition;
}

export function eggCostMultiplier(levels: UpgradeLevels): number {
  return round2(1 - UPGRADE_STEP.eggCost * levels.nutrition);
}

const BASE_BREED_COST: Record<AntRole, number> = {
  [AntRole.Worker]: BREED_COST_WORKER,
  [AntRole.Soldier]: BREED_COST_SOLDIER,
  [AntRole.Scout]: BREED_COST_SCOUT,
  [AntRole.Nurse]: BREED_COST_NURSE,
  [AntRole.Defender]: BREED_COST_DEFENDER,
};

/** An egg's price after Nutrición de larvas; `extra` is any run surcharge on top of the base */
export function breedCost(levels: UpgradeLevels, role: AntRole, extra = 0): number {
  return Math.round((BASE_BREED_COST[role] + extra) * eggCostMultiplier(levels));
}

// ── Castas ──

export interface CasteMultipliers {
  health: number;
  damage: number;
  carry: number;
  speed: number;
}

export function casteMultipliers(levels: UpgradeLevels, role: AntRole): CasteMultipliers {
  const fighter = role === AntRole.Soldier || role === AntRole.Defender;
  const health = fighter ? 1 + UPGRADE_STEP.carapace * levels.carapace : 1 + UPGRADE_STEP.workerHp * levels.workerHp;
  const damage = role === AntRole.Soldier
    ? 1 + UPGRADE_STEP.soldierDamage * levels.damage
    : role === AntRole.Defender ? 1 + UPGRADE_STEP.defenderDamage * levels.defenderDamage : 1;
  return {
    health,
    damage,
    carry: role === AntRole.Worker ? 1 + UPGRADE_STEP.carry * levels.carry : 1,
    speed: 1 + UPGRADE_STEP.speed * levels.legs,
  };
}

// ── Colonia ──

export function pantryTileBonus(levels: UpgradeLevels): number {
  return UPGRADE_STEP.storage * levels.storage;
}

export function digSpeedMultiplier(levels: UpgradeLevels): number {
  return round2(1 + UPGRADE_STEP.dig * levels.dig);
}

export function porterBonus(levels: UpgradeLevels): number {
  return UPGRADE_STEP.porters * levels.porters;
}

export function healRateMultiplier(levels: UpgradeLevels): number {
  return 1 + UPGRADE_STEP.heal * levels.heal;
}

// ── What the panel prints: current → next, in numbers ──

export interface EffectLine {
  label: string;
  now: string;
  /** null at max level */
  next: string | null;
}

const sec = (n: number) => `${n.toFixed(1)} s`;
const pct = (n: number) => `${Math.round(n * 100)}%`;

function at(levels: UpgradeLevels, id: UpgradeId, level: number): UpgradeLevels {
  return { ...levels, [id]: level };
}

type Describe = (levels: UpgradeLevels) => Array<{ label: string; value: string }>;

const role = (r: AntRole, stat: keyof CasteMultipliers, base: number) => (levels: UpgradeLevels) =>
  String(Math.round(base * casteMultipliers(levels, r)[stat]));

/** Each line's readouts at a given set of levels (the panel shows them before and after) */
const DESCRIBE: Record<UpgradeId, Describe> = {
  queenLay: (l) => [{ label: 'Puesta', value: sec(queenLayTime(l)) }],
  queenQueue: (l) => [{ label: 'Huevos por casta', value: String(eggQueuePerCaste(l)) }],
  queenHp: (l) => [
    { label: 'Vida', value: String(queenMaxHealth(l)) },
    { label: 'Armadura', value: String(queenArmor(l)) },
  ],
  queenRegen: (l) => [{ label: 'Regeneración', value: `${queenRegen(l).toFixed(1)} vida/s` }],
  incubation: (l) => [
    { label: 'Obrera nace en', value: sec(hatchTime(l, AntRole.Worker)) },
    { label: 'Huevos por casilla', value: String(eggsPerIncubationTile(l)) },
  ],
  nutrition: (l) => [
    { label: 'Huevo de obrera', value: `${breedCost(l, AntRole.Worker)} comida` },
    { label: 'Comida por larva', value: String(larvaFoodRequired(l)) },
  ],
  carry: (l) => [{ label: 'Carga de obrera', value: role(AntRole.Worker, 'carry', ROLE_STATS.worker.carryCapacity)(l) }],
  damage: (l) => [{ label: 'Daño de soldado', value: role(AntRole.Soldier, 'damage', ROLE_STATS.soldier.damage)(l) }],
  carapace: (l) => [
    { label: 'Vida de soldado', value: role(AntRole.Soldier, 'health', ROLE_STATS.soldier.health)(l) },
    { label: 'Vida de defensora', value: role(AntRole.Defender, 'health', ROLE_STATS.defender.health)(l) },
  ],
  workerHp: (l) => [
    { label: 'Vida de obrera', value: role(AntRole.Worker, 'health', ROLE_STATS.worker.health)(l) },
    { label: 'Vida de nodriza', value: role(AntRole.Nurse, 'health', ROLE_STATS.nurse.health)(l) },
  ],
  defenderDamage: (l) => [{ label: 'Daño de defensora', value: role(AntRole.Defender, 'damage', ROLE_STATS.defender.damage)(l) }],
  legs: (l) => [{ label: 'Velocidad de obrera', value: `${(ANT_SPEED * ROLE_STATS.worker.speedMultiplier * casteMultipliers(l, AntRole.Worker).speed).toFixed(1)} casillas/s` }],
  storage: (l) => [{ label: 'Despensa por casilla', value: String(PANTRY_TILE_CAPACITY + pantryTileBonus(l)) }],
  dig: (l) => [{ label: 'Cavar una casilla', value: sec(EXCAVATION_TIME / digSpeedMultiplier(l)) }],
  porters: (l) => [{ label: 'Porteadoras a la vez', value: String(PORTER_MAX_COUNT + porterBonus(l)) }],
  heal: (l) => [
    { label: 'Velocidad de curación', value: pct(healRateMultiplier(l)) },
    { label: 'Vida por comida', value: String(HEAL_HP_PER_FOOD * healRateMultiplier(l)) },
  ],
};

/** The line's effect at its current level and at the next one ("Puesta: 3.0 s → 2.6 s") */
export function upgradeEffectLines(levels: UpgradeLevels, id: UpgradeId, maxLevel: number): EffectLine[] {
  const level = levels[id];
  const now = DESCRIBE[id](levels);
  const next = level < maxLevel ? DESCRIBE[id](at(levels, id, level + 1)) : null;
  return now.map((line, i) => ({ label: line.label, now: line.value, next: next ? next[i].value : null }));
}
