// Human entities: their components and the factories that build units,
// buildings and the starting base. Humans are not ants: HumanBaseSystem and
// HumanUnitAISystem drive them, CombatSystem lands their shots.

import type { World } from '../../engine/ecs/World';
import type { EntityId } from '../../shared/types';
import { ANT_SPEED } from '../../shared/constants';
import {
  COMPONENT,
  Layer,
  type CombatComponent,
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
import { ARMOR_COMPONENT, type ArmorComponent } from '../systems/helpers/combatHelpers';
import type { TilePos } from '../run/craterSite';
import { HUMAN_COMPONENT, type HumanBuildingComponent, type HumanUnitComponent } from './humanComponents';
import {
  HUMAN_BUILDING_STATS,
  HUMAN_UNIT_STATS,
  pickBuildSlot,
  type HumanBuildingKind,
  type HumanUnitType,
} from './humanBase';

export {
  HUMAN_COMPONENT,
  type HumanBuildingComponent,
  type HumanUnitComponent,
  type HumanUnitState,
} from './humanComponents';

function stampSurface(world: World, entity: EntityId, faction: FactionId): void {
  world.addComponent<SelectableComponent>(entity, COMPONENT.SELECTABLE, { selected: false });
  world.addComponent<LayerComponent>(entity, COMPONENT.LAYER, { layer: Layer.Surface });
  world.addComponent<OwnerComponent>(entity, COMPONENT.OWNER, { faction });
}

/** A Human unit of `type` standing at (x, y). */
export function createHumanUnit(
  world: World,
  type: HumanUnitType,
  x: number,
  y: number,
  baseId: EntityId | null = null,
  faction: FactionId = FactionId.RIVAL,
): EntityId {
  const stats = HUMAN_UNIT_STATS[type];
  const entity = world.createEntity();
  world.addComponent<PositionComponent>(entity, COMPONENT.POSITION, { x, y, prevX: x, prevY: y });
  world.addComponent<HumanUnitComponent>(entity, HUMAN_COMPONENT.UNIT, {
    type,
    state: 'guarding',
    baseId,
    goal: null,
    repathTimer: 0,
    raidTimer: 0,
  });
  world.addComponent<HealthComponent>(entity, COMPONENT.HEALTH, { current: stats.health, max: stats.health, damage: stats.damage });
  if (stats.armor > 0) world.addComponent<ArmorComponent>(entity, ARMOR_COMPONENT, { armor: stats.armor });
  if (stats.damage > 0) {
    world.addComponent<CombatComponent>(entity, COMPONENT.COMBAT, {
      attackDamage: stats.damage,
      attackRange: stats.attackRange,
      attackCooldown: stats.attackCooldown,
      attackTimer: 0,
      targetEntityId: null,
    });
  }
  world.addComponent<PathComponent>(entity, COMPONENT.PATH, { waypoints: [], currentIndex: 0 });
  world.addComponent<RenderComponent>(entity, COMPONENT.RENDER, { color: '#77804f', radius: stats.size, shape: 'circle' });
  world.addComponent<FacingComponent>(entity, COMPONENT.FACING, { angle: Math.PI, legPhase: 0 });
  world.addComponent<RoleStatsComponent>(entity, COMPONENT.ROLE_STATS, {
    visionRange: stats.visionRange,
    speedMultiplier: stats.speed / ANT_SPEED,
    carrySpeedPenalty: 1,
  });
  stampSurface(world, entity, faction);
  return entity;
}

/** A Human building at (x, y); `underConstruction` starts it as a frame the builder still has to finish. */
export function createHumanBuilding(
  world: World,
  kind: HumanBuildingKind,
  x: number,
  y: number,
  faction: FactionId = FactionId.RIVAL,
  underConstruction = false,
): EntityId {
  const stats = HUMAN_BUILDING_STATS[kind];
  const entity = world.createEntity();
  const building = underConstruction && stats.buildTime > 0;
  world.addComponent<PositionComponent>(entity, COMPONENT.POSITION, { x, y, prevX: x, prevY: y });
  world.addComponent<HumanBuildingComponent>(entity, HUMAN_COMPONENT.BUILDING, {
    kind,
    constructing: building ? stats.buildTime : 0,
    trainTimer: 0,
    training: null,
  });
  const start = building ? Math.ceil(stats.health * 0.1) : stats.health;
  world.addComponent<HealthComponent>(entity, COMPONENT.HEALTH, { current: start, max: stats.health, damage: stats.damage });
  world.addComponent<ArmorComponent>(entity, ARMOR_COMPONENT, { armor: stats.armor });
  if (stats.damage > 0) {
    world.addComponent<CombatComponent>(entity, COMPONENT.COMBAT, {
      attackDamage: stats.damage,
      attackRange: stats.attackRange,
      attackCooldown: stats.attackCooldown,
      attackTimer: 0,
      targetEntityId: null,
    });
  }
  world.addComponent<RenderComponent>(entity, COMPONENT.RENDER, { color: '#56603a', radius: stats.halfWidth, shape: 'circle' });
  stampSurface(world, entity, faction);
  return entity;
}

export interface HumanBaseSpawn {
  /** The command center: the base core, its fall wins the run */
  coreId: EntityId;
  buildings: EntityId[];
  builderId: EntityId;
  garrison: EntityId[];
}

/** Soldiers that stand guard when the run starts */
const START_GARRISON = 2;

/** The walkable tile nearest `at` within a few tiles (`at` itself when none is) */
export function nearestWalkable(grid: { isWalkable(x: number, y: number): boolean }, at: TilePos, radius = 4): TilePos {
  for (let r = 0; r <= radius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (grid.isWalkable(at.x + dx, at.y + dy)) return { x: at.x + dx, y: at.y + dy };
      }
    }
  }
  return at;
}

/**
 * The Humans' starting base at `site`: a command center, a barracks, a bunker
 * facing `nest`, a supply depot, one builder and a small guard.
 */
export function createHumanBase(
  world: World,
  grid: { isWalkable(x: number, y: number): boolean },
  site: TilePos,
  nest: TilePos,
  faction: FactionId = FactionId.RIVAL,
): HumanBaseSpawn {
  const coreId = createHumanBuilding(world, 'command_center', site.x, site.y, faction);
  const buildings = [coreId];
  const taken: TilePos[] = [site];
  const walkable = (x: number, y: number) => grid.isWalkable(x, y);
  for (const kind of ['barracks', 'bunker', 'supply_depot'] as const) {
    const slot = pickBuildSlot(kind, site, nest, taken, walkable) ?? nearestWalkable(grid, site);
    taken.push(slot);
    buildings.push(createHumanBuilding(world, kind, slot.x, slot.y, faction));
  }
  const builderAt = nearestWalkable(grid, { x: site.x + 1, y: site.y + 2 });
  const builderId = createHumanUnit(world, 'builder', builderAt.x, builderAt.y, coreId, faction);
  const garrison: EntityId[] = [];
  for (let i = 0; i < START_GARRISON; i++) {
    const at = nearestWalkable(grid, { x: site.x - 2, y: site.y - 1 + i * 2 });
    garrison.push(createHumanUnit(world, 'soldier', at.x, at.y, coreId, faction));
  }
  return { coreId, buildings, builderId, garrison };
}
