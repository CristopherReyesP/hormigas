// Read helpers over the player's Human entities, shared by the player's
// systems, the HUD facade and the overlay. Pure reads of the World.

import type { World } from '../../../engine/ecs/World';
import type { EntityId, Vector2 } from '../../../shared/types';
import { findPath, type PathGrid } from '../../../simulation/pathfinding/AStar';
import { COMPONENT, Layer, type LayerComponent, type PathComponent, type PositionComponent } from '../../components/components';
import { FactionId, ownerOf } from '../../factions/factions';
import { HUMAN_BUILDING_STATS, HUMAN_UNIT_STATS, humanSupplyCap, type HumanBuildingKind, type HumanUnitType } from '../../rival/humanBase';
import { HUMAN_COMPONENT, type HumanBuildingComponent, type HumanUnitComponent } from '../../rival/humanComponents';
import { ORDER_PATH_MAX_STEPS } from '../../../shared/constants';
import { HUMAN_PLAYER_COMPONENT, type HumanProducerComponent } from './humanPlayerComponents';
import type { PlacementWorld } from './humanPlayerRules';

export function isPlayerOwned(world: World, id: EntityId): boolean {
  return ownerOf(world, id) === FactionId.PLAYER;
}

/** The player's Human buildings (`kind` narrows them; `finished` drops frames). */
export function playerBuildings(world: World, kind?: HumanBuildingKind, finished = false): EntityId[] {
  return world.query(HUMAN_COMPONENT.BUILDING, COMPONENT.POSITION).filter((id) => {
    if (!isPlayerOwned(world, id)) return false;
    const b = world.getComponent<HumanBuildingComponent>(id, HUMAN_COMPONENT.BUILDING)!;
    if (kind !== undefined && b.kind !== kind) return false;
    return !finished || b.constructing <= 0;
  });
}

/** The player's Human units (`type` narrows them). */
export function playerUnits(world: World, type?: HumanUnitType): EntityId[] {
  return world.query(HUMAN_COMPONENT.UNIT, COMPONENT.POSITION).filter((id) => {
    if (!isPlayerOwned(world, id)) return false;
    return type === undefined || world.getComponent<HumanUnitComponent>(id, HUMAN_COMPONENT.UNIT)!.type === type;
  });
}

/** Supply in use: living units plus every unit paid for in a queue. */
export function playerSupplyUsed(world: World): number {
  let used = 0;
  for (const id of playerUnits(world)) {
    used += HUMAN_UNIT_STATS[world.getComponent<HumanUnitComponent>(id, HUMAN_COMPONENT.UNIT)!.type].supply;
  }
  for (const id of world.query(HUMAN_PLAYER_COMPONENT.PRODUCER)) {
    if (!isPlayerOwned(world, id)) continue;
    for (const type of world.getComponent<HumanProducerComponent>(id, HUMAN_PLAYER_COMPONENT.PRODUCER)!.queue) {
      used += HUMAN_UNIT_STATS[type].supply;
    }
  }
  return used;
}

/** The supply cap: the command center's plus every finished depot's (none without a command center). */
export function playerSupplyCap(world: World): number {
  if (playerBuildings(world, 'command_center', true).length === 0) return 0;
  return humanSupplyCap(playerBuildings(world, 'supply_depot', true).length);
}

export function positionOf(world: World, id: EntityId): PositionComponent | undefined {
  return world.getComponent<PositionComponent>(id, COMPONENT.POSITION);
}

export function onSurface(world: World, id: EntityId): boolean {
  const layer = world.getComponent<LayerComponent>(id, COMPONENT.LAYER);
  return !layer || layer.layer === Layer.Surface;
}

/** The nearest of `ids` to `from`, or null. */
export function nearest(world: World, ids: readonly EntityId[], from: Vector2): EntityId | null {
  let best: EntityId | null = null;
  let bestDist = Infinity;
  for (const id of ids) {
    const p = positionOf(world, id);
    if (!p) continue;
    const d = Math.hypot(p.x - from.x, p.y - from.y);
    if (d < bestDist || (d === bestDist && best !== null && id < best)) {
      best = id;
      bestDist = d;
    }
  }
  return best;
}

/** Route `path` from `pos` to `goal` (tiles); false when no route exists. */
export function routeTo(grid: PathGrid, pos: Vector2, path: PathComponent, goal: Vector2): boolean {
  const route = findPath(
    grid,
    { x: Math.round(pos.x), y: Math.round(pos.y) },
    { x: Math.round(goal.x), y: Math.round(goal.y) },
    ORDER_PATH_MAX_STEPS,
  );
  if (!route || route.length === 0) return false;
  path.waypoints = route;
  path.currentIndex = 0;
  return true;
}

export function clearPath(path: PathComponent | undefined): void {
  if (!path) return;
  path.waypoints = [];
  path.currentIndex = 0;
}

export function pathDone(path: PathComponent): boolean {
  return path.currentIndex >= path.waypoints.length;
}

/** Wildlife and Crystal structures a building cannot overlap (their footprint, as a building's half width) */
const OTHER_STRUCTURES = [COMPONENT.CRYSTAL_HIVE, COMPONENT.CRYSTAL_SPIRE, COMPONENT.BEETLE_DEN, COMPONENT.CRICKET_DEN];
const OTHER_HALF_WIDTH = 1.5;

/**
 * What the placement rules see of the map: its size and ground, every
 * building and den of any faction, and the mineral nodes. `exclude` leaves
 * entities out (a building checked against everything else).
 */
export function placementWorldOf(
  world: World,
  grid: { width: number; height: number; isWalkable(x: number, y: number): boolean },
  exclude: readonly EntityId[] = [],
): PlacementWorld {
  const skip = new Set(exclude);
  const at = (id: EntityId) => positionOf(world, id)!;
  return {
    width: grid.width,
    height: grid.height,
    isWalkable: (x, y) => grid.isWalkable(x, y),
    buildings: world.query(HUMAN_COMPONENT.BUILDING, COMPONENT.POSITION).filter((id) => !skip.has(id)).map((id) => {
      const kind = world.getComponent<HumanBuildingComponent>(id, HUMAN_COMPONENT.BUILDING)!.kind;
      return { x: at(id).x, y: at(id).y, halfWidth: HUMAN_BUILDING_STATS[kind].halfWidth };
    }).concat(
      OTHER_STRUCTURES.flatMap((store) => world.query(store, COMPONENT.POSITION).filter((id) => !skip.has(id))
        .map((id) => ({ x: at(id).x, y: at(id).y, halfWidth: OTHER_HALF_WIDTH }))),
    ),
    minerals: world.query(COMPONENT.MINERAL, COMPONENT.POSITION).filter((id) => !skip.has(id)).map((id) => ({ x: at(id).x, y: at(id).y })),
  };
}
