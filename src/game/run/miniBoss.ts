// Mini-bosses: every third night wave is led by the rival's champion.
// - Fauna salvaje: the Acorazado Colosal, a huge beetle that charges.
// - Colmena de Cristal: the Prisma Guardián, a shielded crystal that keeps
//   spawning small shards.
// - Humanos: the Coronel en Tanque Pesado, a heavy tank with a wide splash
//   that armors the troops around it.
// makeMiniBoss() turns a wave unit into its boss; WaveBossSystem runs the
// abilities; UndergroundInvasionSystem pays the reward when one dies.

import type { World } from '../../engine/ecs/World';
import type { EntityId } from '../../shared/types';
import {
  COMPONENT,
  Layer,
  type CombatComponent,
  type CrystalUnitComponent,
  type HealthComponent,
  type LayerComponent,
  type RenderComponent,
  type RoleStatsComponent,
} from '../components/components';
import { createBeetle } from '../entities/factories';
import { CRYSTAL_UNIT_STATS } from '../rival/crystalRival';
import type { ShieldComponent } from '../rival/crystalShield';
import { HUMAN_UNIT_STATS } from '../rival/humanBase';
import { HUMAN_COMPONENT, type HumanUnitComponent } from '../rival/humanComponents';
import { ARMOR_COMPONENT, type ArmorComponent } from '../systems/helpers/combatHelpers';
import { ANT_SPEED, BEETLE_STATS } from '../../shared/constants';
import type { MiniBossKind } from './waveComposition';

export type { MiniBossKind };

/** A boss on the field: the three mini-bosses, and the Crystal Queen (tracked for the HUD bar only) */
export type BossKind = MiniBossKind | 'crystal_queen';

export const BOSS_COMPONENT = 'mini_boss';

export interface BossComponent {
  kind: BossKind;
  name: string;
  /** 1 on wave 3, 2 on wave 6, ...: bosses grow with each boss wave */
  tier: number;
  /** Seconds until the ability may fire */
  abilityTimer: number;
  /** Acorazado Colosal: digging in, charging, or neither */
  phase: 'idle' | 'windup' | 'charging';
  phaseTimer: number;
  /** Ants the current charge already rammed (each one once) */
  rammed: EntityId[];
  /** Prisma Guardián: the shards it spawned */
  shards: EntityId[];
  /** Coronel: his shells' splash radius, in tiles */
  splashRadius?: number;
}

export interface MiniBossInfo {
  name: string;
  /** One line for the info card and the announcement */
  ability: string;
}

export const MINI_BOSSES: Readonly<Record<MiniBossKind, MiniBossInfo>> = {
  colossus: { name: 'Acorazado Colosal', ability: 'Embiste a su presa a toda velocidad y arrolla a las hormigas en su camino.' },
  prism: { name: 'Prisma Guardián', ability: 'Lo protege un escudo enorme y no deja de crear esquirlas de cristal que atacan el nido.' },
  colonel: { name: 'Coronel en Tanque Pesado', ability: 'Sus obuses estallan en un área grande y su aura blinda a las tropas cercanas.' },
};

export const CRYSTAL_QUEEN_NAME = 'Reina de Cristal';

/** Boss numbers. Starting points for playtests. */
export const BOSS_TUNING = {
  colossus: {
    /** Health: a full beetle times (3 + tier) */
    healthBase: 3,
    damageMult: 2,
    size: 1.2,
    /** Seconds before the first charge, then between charges */
    firstCharge: 3,
    cooldown: 7,
    /** It digs in (slowed to `windupSpeed`) for `windup` s, then charges at `chargeSpeed`× for `chargeTime` s */
    windup: 0.8,
    windupSpeed: 0.2,
    chargeTime: 1.4,
    chargeSpeed: 3.2,
    /** It charges prey this far away, in tiles */
    chargeMin: 2.5,
    chargeMax: 9,
    /** Each ant within `chargeHitRadius` of it while charging takes `chargeDamage`, once per charge */
    chargeDamage: 30,
    chargeHitRadius: 1.1,
  },
  prism: {
    /** Health: a drone times (3 + tier); a shield of `shield` + 100 per tier */
    healthBase: 3,
    shield: 400,
    shieldRegen: 16,
    size: 0.95,
    spawnInterval: 8,
    shardsPerSpawn: 2,
    maxShards: 6,
    /** A shard keeps this share of a drone's health, damage and shield */
    shardScale: 0.3,
    shardSize: 0.3,
  },
  colonel: {
    /** Health: a tank times (2 + tier / 2) */
    healthBase: 2,
    armor: 5,
    damageMult: 1.4,
    splashRadius: 2.6,
    size: 1.15,
    /** Allied troops within `auraRadius` get `auraArmor` more armor */
    auraRadius: 5,
    auraArmor: 2,
  },
} as const;

export function bossOf(world: World, id: EntityId): BossComponent | undefined {
  return world.getComponent<BossComponent>(id, BOSS_COMPONENT);
}

function stamp(world: World, id: EntityId, kind: BossKind, name: string, tier: number, extra: Partial<BossComponent> = {}): BossComponent {
  const boss: BossComponent = { kind, name, tier, abilityTimer: 0, phase: 'idle', phaseTimer: 0, rammed: [], shards: [], ...extra };
  world.addComponent<BossComponent>(id, BOSS_COMPONENT, boss);
  return boss;
}

function setHealth(world: World, id: EntityId, max: number, damage?: number): void {
  const health = world.getComponent<HealthComponent>(id, COMPONENT.HEALTH);
  if (!health) return;
  health.max = Math.round(max);
  health.current = health.max;
  if (damage !== undefined) health.damage = Math.round(damage);
}

function setCombat(world: World, id: EntityId, over: Partial<CombatComponent>): void {
  const combat = world.getComponent<CombatComponent>(id, COMPONENT.COMBAT);
  if (combat) Object.assign(combat, over);
}

function setSize(world: World, id: EntityId, size: number): void {
  const render = world.getComponent<RenderComponent>(id, COMPONENT.RENDER);
  if (render) render.radius = size;
}

/**
 * Turn a wave unit into the mini-boss `kind` of tier `tier`: a beetle for
 * the Acorazado Colosal, a Crystal drone for the Prisma Guardián (it becomes
 * a Sentinel), a Human troop for the Coronel (it climbs into a tank).
 */
export function makeMiniBoss(world: World, id: EntityId, kind: MiniBossKind, tier: number): void {
  const t = Math.max(1, Math.floor(tier));
  if (kind === 'colossus') {
    const cfg = BOSS_TUNING.colossus;
    const damage = BEETLE_STATS.damage * cfg.damageMult;
    setHealth(world, id, BEETLE_STATS.health * (cfg.healthBase + t), damage);
    setCombat(world, id, { attackDamage: damage, attackRange: BEETLE_STATS.attackRange + 0.3 });
    setSize(world, id, cfg.size);
    stamp(world, id, kind, MINI_BOSSES.colossus.name, t, { abilityTimer: cfg.firstCharge });
    return;
  }
  if (kind === 'prism') {
    const cfg = BOSS_TUNING.prism;
    const unit = world.getComponent<CrystalUnitComponent>(id, COMPONENT.CRYSTAL_UNIT);
    if (unit) unit.kind = 'sentinel';
    const sentinel = CRYSTAL_UNIT_STATS.sentinel;
    setHealth(world, id, CRYSTAL_UNIT_STATS.drone.health * (cfg.healthBase + t), sentinel.damage * 1.5);
    setCombat(world, id, { attackDamage: Math.round(sentinel.damage * 1.5), attackRange: sentinel.attackRange, attackCooldown: sentinel.attackCooldown });
    const shield = world.getComponent<ShieldComponent>(id, COMPONENT.SHIELD);
    if (shield) {
      shield.max = cfg.shield + 100 * t;
      shield.current = shield.max;
      shield.regenRate = cfg.shieldRegen;
    }
    setSize(world, id, cfg.size);
    stamp(world, id, kind, MINI_BOSSES.prism.name, t, { abilityTimer: cfg.spawnInterval });
    return;
  }
  const cfg = BOSS_TUNING.colonel;
  const tank = HUMAN_UNIT_STATS.tank;
  const unit = world.getComponent<HumanUnitComponent>(id, HUMAN_COMPONENT.UNIT);
  if (unit) unit.type = 'tank';
  const damage = tank.damage * cfg.damageMult;
  setHealth(world, id, tank.health * (cfg.healthBase + t / 2), damage);
  setCombat(world, id, { attackDamage: Math.round(damage), attackRange: tank.attackRange, attackCooldown: tank.attackCooldown });
  const armor = world.getComponent<ArmorComponent>(id, ARMOR_COMPONENT);
  if (armor) armor.armor = cfg.armor;
  else world.addComponent<ArmorComponent>(id, ARMOR_COMPONENT, { armor: cfg.armor });
  const stats = world.getComponent<RoleStatsComponent>(id, COMPONENT.ROLE_STATS);
  if (stats) {
    stats.speedMultiplier = tank.speed / ANT_SPEED;
    stats.visionRange = tank.visionRange;
  }
  setSize(world, id, cfg.size);
  stamp(world, id, kind, MINI_BOSSES.colonel.name, t, { splashRadius: cfg.splashRadius });
}

/** The Acorazado Colosal breaking into the nest at (x, y) */
export function createColossus(world: World, x: number, y: number, tier: number): EntityId {
  const id = createBeetle(world, x, y, null);
  const layer = world.getComponent<LayerComponent>(id, COMPONENT.LAYER);
  if (layer) layer.layer = Layer.Underground;
  makeMiniBoss(world, id, 'colossus', tier);
  return id;
}

/** Mark the Crystal Queen so the HUD shows her health bar like a mini-boss's (no reward, no ability here) */
export function markCrystalQueen(world: World, id: EntityId): void {
  stamp(world, id, 'crystal_queen', CRYSTAL_QUEEN_NAME, 3);
}
