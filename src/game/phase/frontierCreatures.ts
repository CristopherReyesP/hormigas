// Phase 2's creatures, beyond the thorn wall. They are wildlife built on the
// beetle entity (its AI, combat, kills and meat all apply) with their own
// stats, sprite and marker component:
// - legionaries: crimson army ants from the Legionary nest, fast, in numbers;
//   with every night wave a column of them marches on the colony;
// - the Legionary Queen: guards the nest; she calls legionaries to her side;
// - weaver spiders: ambushers tied to their lairs, heavy bites;
// - stalker mantises: lone hunters that roam the new ground, huge strikes.

import type { World } from '../../engine/ecs/World';
import type { EntityId } from '../../shared/types';
import {
  COMPONENT,
  type BeetleDenComponent,
  type CombatComponent,
  type HealthComponent,
  type RenderComponent,
  type RoleStatsComponent,
} from '../components/components';
import { createBeetle, createBeetleDen } from '../entities/factories';
import { ANT_SPEED } from '../../shared/constants';

export type FrontierCreatureKind = 'legionary' | 'legion_queen' | 'spider' | 'mantis' | 'tarantula';
export type FrontierDenKind = 'legion_nest' | 'spider_lair';

export const FRONTIER_CREATURE_COMPONENT = 'frontier_creature';
export const FRONTIER_DEN_COMPONENT = 'frontier_den';

export interface FrontierCreatureComponent {
  kind: FrontierCreatureKind;
  /** Marching on the colony with a night wave (steered by FrontierSystem, not the beetle AI) */
  raider: boolean;
  /** Repath countdown while raiding */
  repath: number;
  /** The Queen: seconds until she may call her guard again; the tarantula: until its next pounce */
  abilityTimer: number;
  /** The tarantula: seconds left in its pounce (it lunges at triple speed) */
  pounce?: number;
}

export interface FrontierDenComponent {
  kind: FrontierDenKind;
  /** Seconds until the next creature leaves it */
  spawnTimer: number;
  /** Creatures it keeps alive around itself */
  keep: number;
  /** The ones alive now */
  members: EntityId[];
  /** Seconds it has stood: it keeps more creatures, and grows tougher, the longer it stands */
  age?: number;
}

export interface FrontierCreatureStats {
  name: string;
  health: number;
  damage: number;
  /** Tiles per second */
  speed: number;
  attackRange: number;
  attackCooldown: number;
  visionRange: number;
  /** Render radius (tiles): the hit box and the health bar width */
  size: number;
}

/** Each is a step up from the Phase 1 beetle (240 HP, 12 dmg, 0.9 t/s); raised in the difficulty pass */
export const FRONTIER_CREATURE_STATS: Readonly<Record<FrontierCreatureKind, FrontierCreatureStats>> = {
  legionary: { name: 'Hormiga legionaria', health: 140, damage: 11, speed: 1.7, attackRange: 1.1, attackCooldown: 1.0, visionRange: 7, size: 0.4 },
  legion_queen: { name: 'Reina Legionaria', health: 4500, damage: 40, speed: 0.7, attackRange: 1.6, attackCooldown: 1.4, visionRange: 8, size: 1.1 },
  spider: { name: 'Araña tejedora', health: 520, damage: 26, speed: 1.4, attackRange: 1.3, attackCooldown: 1.3, visionRange: 7, size: 0.65 },
  mantis: { name: 'Mantis acechadora', health: 1400, damage: 48, speed: 1.1, attackRange: 1.8, attackCooldown: 2.0, visionRange: 9, size: 0.9 },
  // Hunts only ants: senses them from far, stalks, then pounces (TarantulaSystem)
  tarantula: { name: 'Tarántula alienígena', health: 2600, damage: 34, speed: 1.8, attackRange: 2.4, attackCooldown: 1.2, visionRange: 14, size: 2.0 },
};

export interface FrontierDenStats {
  name: string;
  health: number;
  /** Creatures kept around it */
  keep: number;
  /** Seconds between two of them leaving it */
  spawnCooldown: number;
  creature: FrontierCreatureKind;
}

export const FRONTIER_DEN_STATS: Readonly<Record<FrontierDenKind, FrontierDenStats>> = {
  legion_nest: { name: 'Hormiguero Legionario', health: 5000, keep: 10, spawnCooldown: 9, creature: 'legionary' },
  spider_lair: { name: 'Guarida de araña', health: 1800, keep: 3, spawnCooldown: 35, creature: 'spider' },
};

/** The Queen's guard call: every `cooldown` s in a fight she summons `count` legionaries */
export const LEGION_QUEEN_CALL = { cooldown: 18, count: 3 } as const;

export function frontierCreatureOf(world: World, id: EntityId): FrontierCreatureComponent | undefined {
  return world.getComponent<FrontierCreatureComponent>(id, FRONTIER_CREATURE_COMPONENT);
}

export function frontierDenOf(world: World, id: EntityId): FrontierDenComponent | undefined {
  return world.getComponent<FrontierDenComponent>(id, FRONTIER_DEN_COMPONENT);
}

/** A Phase 2 creature at (x, y), tied to den `homeId` (its leash, and who it counts against) */
export function createFrontierCreature(world: World, kind: FrontierCreatureKind, x: number, y: number, homeId: EntityId | null = null): EntityId {
  const stats = FRONTIER_CREATURE_STATS[kind];
  const id = createBeetle(world, x, y, homeId);
  const health = world.getComponent<HealthComponent>(id, COMPONENT.HEALTH)!;
  health.max = stats.health;
  health.current = stats.health;
  health.damage = stats.damage;
  const combat = world.getComponent<CombatComponent>(id, COMPONENT.COMBAT)!;
  combat.attackDamage = stats.damage;
  combat.attackRange = stats.attackRange;
  combat.attackCooldown = stats.attackCooldown;
  const role = world.getComponent<RoleStatsComponent>(id, COMPONENT.ROLE_STATS);
  if (role) {
    role.speedMultiplier = stats.speed / ANT_SPEED;
    role.visionRange = stats.visionRange;
  }
  const render = world.getComponent<RenderComponent>(id, COMPONENT.RENDER);
  if (render) render.radius = stats.size;
  world.addComponent<FrontierCreatureComponent>(id, FRONTIER_CREATURE_COMPONENT, {
    kind,
    raider: false,
    repath: 0,
    abilityTimer: kind === 'legion_queen' ? LEGION_QUEEN_CALL.cooldown / 2 : 0,
  });
  // The beetle den bookkeeping: the death handler gives the slot back, so take it here
  if (homeId !== null) {
    const den = world.getComponent<BeetleDenComponent>(homeId, COMPONENT.BEETLE_DEN);
    if (den) den.activeBeetles++;
    frontierDenOf(world, homeId)?.members.push(id);
  }
  return id;
}

/**
 * A Phase 2 den at (x, y). It is a beetle den underneath (combat, the dominion
 * count, the minimap and the den objectives all see it) that never breeds
 * beetles: FrontierSystem keeps its own creatures around it.
 */
export function createFrontierDen(world: World, kind: FrontierDenKind, x: number, y: number): EntityId {
  const stats = FRONTIER_DEN_STATS[kind];
  const id = createBeetleDen(world, x, y);
  const den = world.getComponent<BeetleDenComponent>(id, COMPONENT.BEETLE_DEN)!;
  den.health = stats.health;
  den.maxHealth = stats.health;
  den.maxBeetles = 0; // BeetleSpawnSystem never breeds beetles here
  const health = world.getComponent<HealthComponent>(id, COMPONENT.HEALTH)!;
  health.max = stats.health;
  health.current = stats.health;
  world.addComponent<FrontierDenComponent>(id, FRONTIER_DEN_COMPONENT, {
    kind,
    spawnTimer: 0,
    keep: stats.keep,
    members: [],
  });
  return id;
}
