import type { World } from '../../../engine/ecs/World';
import type { EntityId, Vector2 } from '../../../shared/types';
import type { TransitSystem } from '../TransitSystem';
import {
  COMPONENT,
  AntRole,
  AntState,
  FoodType,
  Layer,
  type AntComponent,
  type FoodSourceComponent,
  type LayerComponent,
  type MineralComponent,
  type PathComponent,
  type PositionComponent,
  type ResourceOrderKind,
} from '../../components/components';
import { ART_PX, SPRITE_GRID } from '../../../engine/renderer/sprites/spriteScale';
import { TILE_SIZE } from '../../../shared/constants';

/**
 * Resource orders: Minar (a mineral node) and Recolectar (one food source).
 * A selected worker that takes one keeps looping between its source and the
 * nest until the source runs out or the player gives it another order. It is
 * not a PlayerOrder: the colony AI keeps running the ant (it eats, fights back
 * near home, rides the shaft to the pantry) and AntAISystem sends it back to
 * its source after each delivery.
 */

/** Half the drawn sprite, in tiles: a click anywhere on the drawing hits it. */
function spriteHalfTiles(grid: number): number {
  return (grid * ART_PX) / 2 / TILE_SIZE;
}

/** Tiles from a resource's center a click or tap still lands on its sprite. */
export function resourcePickRadius(world: World, id: EntityId): number {
  if (world.getComponent(id, COMPONENT.MINERAL)) return spriteHalfTiles(SPRITE_GRID.mineral);
  const food = world.getComponent<FoodSourceComponent>(id, COMPONENT.FOOD_SOURCE);
  if (food?.resourceType === FoodType.GiantMushroom) return spriteHalfTiles(SPRITE_GRID.giantMushroom);
  return spriteHalfTiles(SPRITE_GRID.food);
}

function onSurface(world: World, id: EntityId): boolean {
  const layer = world.getComponent<LayerComponent>(id, COMPONENT.LAYER);
  return !layer || layer.layer === Layer.Surface;
}

/** A mineral node with ore left. */
export function isMineralNode(world: World, id: EntityId): boolean {
  const node = world.getComponent<MineralComponent>(id, COMPONENT.MINERAL);
  return !!node && node.amount > 0 && onSurface(world, id);
}

/** A surface food source with food left. */
export function isFoodSource(world: World, id: EntityId): boolean {
  const food = world.getComponent<FoodSourceComponent>(id, COMPONENT.FOOD_SOURCE);
  return !!food && food.amount > 0 && onSurface(world, id);
}

/**
 * The surface mineral node or food source drawn under `at` (entity-position
 * space), or null: the closest one whose sprite covers the point. `canSee` is
 * the fog rule (resources are drawn on explored ground only).
 */
export function findResourceAt(world: World, at: Vector2, canSee: (x: number, y: number) => boolean): EntityId | null {
  let best: EntityId | null = null;
  let bestDist = Infinity;
  for (const store of [COMPONENT.MINERAL, COMPONENT.FOOD_SOURCE]) {
    for (const id of world.query(store, COMPONENT.POSITION)) {
      if (!onSurface(world, id)) continue;
      const pos = world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      const dist = Math.hypot(pos.x - at.x, pos.y - at.y);
      if (dist > resourcePickRadius(world, id) || dist >= bestDist) continue;
      if (!canSee(Math.round(pos.x), Math.round(pos.y))) continue;
      best = id;
      bestDist = dist;
    }
  }
  return best;
}

/** Own surface workers among `ids` free to take a resource order. */
function orderableWorkers(world: World, ids: readonly EntityId[]): EntityId[] {
  return ids.filter((id) => {
    const ant = world.getComponent<AntComponent>(id, COMPONENT.ANT);
    if (!ant || ant.role !== AntRole.Worker) return false;
    if (!world.getComponent(id, COMPONENT.PATH) || !world.getComponent(id, COMPONENT.POSITION)) return false;
    return onSurface(world, id);
  });
}

function clearPath(world: World, id: EntityId): void {
  const path = world.getComponent<PathComponent>(id, COMPONENT.PATH);
  if (path) {
    path.waypoints = [];
    path.currentIndex = 0;
  }
}

/** Drop whatever the ant was doing for the player (a move, an attack, a ride down) before the new order. */
function takeOverAnt(world: World, id: EntityId, transit?: TransitSystem | null): AntComponent {
  transit?.cancelEnter(id);
  world.removeComponent(id, COMPONENT.PLAYER_ORDER);
  const combat = world.getComponent<{ targetEntityId: EntityId | null }>(id, COMPONENT.COMBAT);
  if (combat) combat.targetEntityId = null;
  clearPath(world, id);
  const ant = world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
  ant.stateTimer = 0;
  ant.stuckTimer = 0;
  return ant;
}

/**
 * Minar: every own surface worker in `ids` mines `nodeId` in a loop. Other
 * castes are left out. Returns the workers that took it (none when the
 * target is not a mineral node with ore).
 */
export function issueMineOrders(world: World, ids: readonly EntityId[], nodeId: EntityId, transit?: TransitSystem | null): EntityId[] {
  if (!isMineralNode(world, nodeId)) return [];
  const workers = orderableWorkers(world, ids);
  for (const id of workers) {
    const ant = takeOverAnt(world, id, transit);
    ant.resourceOrder = 'mine';
    ant.foodTargetId = null;
    ant.mineralTargetId = nodeId;
    ant.miningProgress = 0;
    // A worker with a load delivers it first; AntAISystem sends it on from there
    ant.state = AntState.Mining;
  }
  return workers;
}

/**
 * Recolectar: every own surface worker in `ids` gathers from `foodId` in a
 * loop (to the pantry and back) until it is empty. Returns the workers that
 * took it.
 */
export function issueGatherOrders(world: World, ids: readonly EntityId[], foodId: EntityId, transit?: TransitSystem | null): EntityId[] {
  if (!isFoodSource(world, foodId)) return [];
  const workers = orderableWorkers(world, ids);
  for (const id of workers) {
    const ant = takeOverAnt(world, id, transit);
    ant.resourceOrder = 'gather';
    ant.foodTargetId = foodId;
    ant.mineralTargetId = null;
    ant.miningProgress = 0;
    ant.state = AntState.Searching;
  }
  return workers;
}

/**
 * End a resource order (a new order, Detener, the retreat horn, or the source
 * ran out). The ant keeps any load it holds and goes back to its own work.
 * Returns whether it had one.
 */
export function clearResourceOrder(world: World, id: EntityId): boolean {
  const ant = world.getComponent<AntComponent>(id, COMPONENT.ANT);
  if (!ant || ant.resourceOrder === undefined) return false;
  if (ant.resourceOrder === 'mine') {
    ant.mineralTargetId = null;
    ant.miningProgress = 0;
    if (ant.state === AntState.Mining) ant.state = AntState.Searching;
  }
  ant.resourceOrder = undefined;
  ant.foodTargetId = null;
  return true;
}

/** Workers whose resource order (of `kind`) points at `targetId`. */
export function workersOrderedTo(world: World, targetId: EntityId, kind: ResourceOrderKind): number {
  let n = 0;
  for (const id of world.query(COMPONENT.ANT)) {
    const ant = world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
    if (ant.resourceOrder !== kind) continue;
    if ((kind === 'mine' ? ant.mineralTargetId : ant.foodTargetId) === targetId) n++;
  }
  return n;
}

/** Workers bound to a mineral node, ordered or not. */
export function minersOn(world: World, nodeId: EntityId): number {
  let n = 0;
  for (const id of world.query(COMPONENT.ANT)) {
    if (world.getComponent<AntComponent>(id, COMPONENT.ANT)!.mineralTargetId === nodeId) n++;
  }
  return n;
}

/** The plural Spanish name of a food type for the order toast: "recolectar hojas". */
export function foodOrderNoun(type: string | undefined): string {
  if (type === FoodType.Mushroom || type === FoodType.GiantMushroom) return 'hongos';
  if (type === FoodType.BeetleMeat || type === FoodType.CricketMeat) return 'carne';
  return 'hojas';
}

/** "3 obreras", "1 obrera" */
export function workersNoun(n: number): string {
  return n === 1 ? '1 obrera' : `${n} obreras`;
}
