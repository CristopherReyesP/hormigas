// Entity factories for the Crystal Hive rival: its units (drone, Sentinel,
// Crystal Queen) and its spires. Every Crystal entity carries a regenerating
// shield (COMPONENT.SHIELD) on top of its health.

import type { World } from '../../engine/ecs/World';
import type { EntityId } from '../../shared/types';
import {
  COMPONENT,
  CrystalUnitState,
  Layer,
  type CombatComponent,
  type CrystalSpireComponent,
  type CrystalStructureKind,
  type CrystalUnitComponent,
  type CrystalUnitKind,
  type FacingComponent,
  type HealthComponent,
  type LayerComponent,
  type OwnerComponent,
  type PathComponent,
  type PositionComponent,
  type RenderComponent,
  type RoleStatsComponent,
  type SelectableComponent,
} from '../components/components';
import { FactionId } from '../factions/factions';
import { ANT_SPEED } from '../../shared/constants';
import { CRYSTAL_HIVE_SHIELD, CRYSTAL_SPIRE_STATS, CRYSTAL_UNIT_STATS, spireInterval } from './crystalRival';
import { createShield, type ShieldComponent } from './crystalShield';

/** Give an entity a full shield */
export function addShield(world: World, entity: EntityId, max: number, regen: number, delay?: number): void {
  world.addComponent<ShieldComponent>(entity, COMPONENT.SHIELD, createShield(max, regen, delay));
}

/** The hive core's shield (createCrystalHive calls this) */
export function addHiveShield(world: World, hive: EntityId): void {
  addShield(world, hive, CRYSTAL_HIVE_SHIELD.max, CRYSTAL_HIVE_SHIELD.regen, CRYSTAL_HIVE_SHIELD.delay);
}

/** A Crystal unit of `kind`: hovering, slow, strong, shielded. CrystalUnitAISystem drives it. */
export function createCrystalUnit(
  world: World,
  kind: CrystalUnitKind,
  x: number,
  y: number,
  hiveId: EntityId | null = null,
  faction: FactionId = FactionId.RIVAL,
): EntityId {
  const stats = CRYSTAL_UNIT_STATS[kind];
  const entity = world.createEntity();
  world.addComponent<PositionComponent>(entity, COMPONENT.POSITION, { x, y, prevX: x, prevY: y });
  world.addComponent<CrystalUnitComponent>(entity, COMPONENT.CRYSTAL_UNIT, {
    kind,
    state: CrystalUnitState.Guarding,
    hiveId,
    goal: null,
    repathTimer: 0,
  });
  world.addComponent<HealthComponent>(entity, COMPONENT.HEALTH, { current: stats.health, max: stats.health, damage: stats.damage });
  addShield(world, entity, stats.shield, stats.shieldRegen);
  world.addComponent<CombatComponent>(entity, COMPONENT.COMBAT, {
    attackDamage: stats.damage,
    attackRange: stats.attackRange,
    attackCooldown: stats.attackCooldown,
    attackTimer: 0,
    targetEntityId: null,
  });
  world.addComponent<PathComponent>(entity, COMPONENT.PATH, { waypoints: [], currentIndex: 0 });
  world.addComponent<RenderComponent>(entity, COMPONENT.RENDER, { color: '#5ff3ff', radius: stats.size, shape: 'crystal_drone' });
  world.addComponent<FacingComponent>(entity, COMPONENT.FACING, { angle: 0, legPhase: 0 });
  world.addComponent<RoleStatsComponent>(entity, COMPONENT.ROLE_STATS, {
    visionRange: stats.visionRange,
    speedMultiplier: stats.speed / ANT_SPEED,
    carrySpeedPenalty: 1.0,
  });
  world.addComponent<SelectableComponent>(entity, COMPONENT.SELECTABLE, { selected: false });
  world.addComponent<LayerComponent>(entity, COMPONENT.LAYER, { layer: Layer.Surface });
  world.addComponent<OwnerComponent>(entity, COMPONENT.OWNER, { faction });
  return entity;
}

/** A spire of the hive: a shielded crystal tower, one floor to start. */
export function createCrystalSpire(
  world: World,
  kind: CrystalStructureKind,
  x: number,
  y: number,
  hiveId: EntityId | null,
  faction: FactionId = FactionId.RIVAL,
): EntityId {
  const entity = world.createEntity();
  world.addComponent<PositionComponent>(entity, COMPONENT.POSITION, { x, y, prevX: x, prevY: y });
  world.addComponent<CrystalSpireComponent>(entity, COMPONENT.CRYSTAL_SPIRE, {
    kind,
    floors: 1,
    productionTimer: spireInterval(kind, 1),
    hiveId,
  });
  world.addComponent<HealthComponent>(entity, COMPONENT.HEALTH, {
    current: CRYSTAL_SPIRE_STATS.health,
    max: CRYSTAL_SPIRE_STATS.health,
    damage: 0,
  });
  addShield(world, entity, CRYSTAL_SPIRE_STATS.shield, CRYSTAL_SPIRE_STATS.shieldRegen);
  world.addComponent<RenderComponent>(entity, COMPONENT.RENDER, { color: '#5ff3ff', radius: CRYSTAL_SPIRE_STATS.size, shape: 'crystal_spire' });
  world.addComponent<SelectableComponent>(entity, COMPONENT.SELECTABLE, { selected: false });
  world.addComponent<LayerComponent>(entity, COMPONENT.LAYER, { layer: Layer.Surface });
  world.addComponent<OwnerComponent>(entity, COMPONENT.OWNER, { faction });
  return entity;
}

/** Raise a spire by one floor: more hull, faster production */
export function addSpireFloor(world: World, spire: EntityId): void {
  const data = world.getComponent<CrystalSpireComponent>(spire, COMPONENT.CRYSTAL_SPIRE);
  const health = world.getComponent<HealthComponent>(spire, COMPONENT.HEALTH);
  if (!data) return;
  data.floors++;
  data.productionTimer = Math.min(data.productionTimer, spireInterval(data.kind, data.floors));
  if (health) {
    health.max += CRYSTAL_SPIRE_STATS.healthPerFloor;
    health.current += CRYSTAL_SPIRE_STATS.healthPerFloor;
  }
}
