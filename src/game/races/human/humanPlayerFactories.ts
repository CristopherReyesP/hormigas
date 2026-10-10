// The player's Human entities: the shared Human units and buildings stamped
// as the player's, plus the components only the player's carry (a builder's
// job, a building's production queue), and the expedition's landing.

import type { World } from '../../../engine/ecs/World';
import type { EntityId } from '../../../shared/types';
import { createMineral } from '../../entities/factories';
import { FactionId } from '../../factions/factions';
import { createHumanBuilding, createHumanUnit, nearestWalkable } from '../../rival/humanFactories';
import { HUMAN_BUILDING_STATS, type HumanBuildingKind, type HumanUnitType } from '../../rival/humanBase';
import type { TilePos } from '../../run/craterSite';
import { HUMAN_PLAYER_COMPONENT, type HumanProducerComponent, type HumanWorkerComponent } from './humanPlayerComponents';
import { PLAYER_HUMAN_START, startBuildingSpot, trainableAt } from './humanPlayerRules';
import { placementWorldOf, positionOf } from './humanPlayerQueries';

/** A player Human unit of `type` at (x, y); builders also get their job slot. */
export function createPlayerHumanUnit(
  world: World,
  type: HumanUnitType,
  x: number,
  y: number,
  baseId: EntityId | null = null,
): EntityId {
  const id = createHumanUnit(world, type, x, y, baseId, FactionId.PLAYER);
  if (type === 'builder') {
    world.addComponent<HumanWorkerComponent>(id, HUMAN_PLAYER_COMPONENT.WORKER, {
      task: 'idle', nodeId: null, buildingId: null, carrying: 0, progress: 0, repath: 0, working: false,
    });
  }
  return id;
}

/** A player Human building at (x, y); `underConstruction` lays a frame for the builders. */
export function createPlayerHumanBuilding(
  world: World,
  kind: HumanBuildingKind,
  x: number,
  y: number,
  underConstruction = false,
): EntityId {
  const id = createHumanBuilding(world, kind, x, y, FactionId.PLAYER, underConstruction);
  if (trainableAt(kind).length > 0) {
    world.addComponent<HumanProducerComponent>(id, HUMAN_PLAYER_COMPONENT.PRODUCER, { queue: [], progress: 0, rally: null });
  }
  return id;
}

export interface HumanPlayerStart {
  coreId: EntityId;
  builders: EntityId[];
  soldiers: EntityId[];
  /** The finished Cuartel beside the command center (null when left out or nothing fits) */
  barracksId: EntityId | null;
  /** The home field's nodes (empty when it was not asked for) */
  minerals: EntityId[];
}

type Walkable = { isWalkable(x: number, y: number): boolean };
type MapGrid = Walkable & { width: number; height: number };

/** Directions tried for the home mineral field, in order */
const FIELD_DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1],
];
/** Node offsets around the field center */
const FIELD_NODES: ReadonlyArray<readonly [number, number]> = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1]];
/** How far the field center sits from the command center (tiles), nearest tried first */
const FIELD_DISTANCES = [8, 9, 7, 10];

/**
 * A small mineral field a short walk from the command center, StarCraft's
 * main-base minerals: the first direction whose nodes all land on walkable
 * ground. Deterministic. Returns the nodes made (none when nothing fits).
 */
export function spawnHomeMineralField(world: World, grid: Walkable, core: TilePos): EntityId[] {
  for (const distance of FIELD_DISTANCES) {
    for (const [dx, dy] of FIELD_DIRECTIONS) {
      const len = Math.hypot(dx, dy);
      const cx = Math.round(core.x + (dx / len) * distance);
      const cy = Math.round(core.y + (dy / len) * distance);
      const nodes = FIELD_NODES.map(([ox, oy]) => ({ x: cx + ox, y: cy + oy }));
      if (!nodes.every((n) => grid.isWalkable(n.x, n.y))) continue;
      return nodes.map((n) => createMineral(world, n.x, n.y));
    }
  }
  return [];
}

/**
 * The expedition lands at `center`: the player's command center, a finished
 * Cuartel beside it, two builders and two soldiers, the starting minerals in
 * the bank and (unless turned off) a home mineral field nearby. No nest and
 * no queen. The Cuartel goes on the first nearby spot the placement rules
 * accept, after the field, so it never sits on a node or on a unit.
 */
export function spawnHumanPlayerStart(
  world: World,
  grid: MapGrid,
  center: TilePos,
  options: { homeField?: boolean; barracks?: boolean } = {},
): HumanPlayerStart {
  const coreId = createPlayerHumanBuilding(world, 'command_center', center.x, center.y);
  const ring = Math.ceil(HUMAN_BUILDING_STATS.command_center.halfWidth) + 1;
  const builders: EntityId[] = [];
  for (let i = 0; i < PLAYER_HUMAN_START.builders; i++) {
    const at = nearestWalkable(grid, { x: center.x - 1 + i * 2, y: center.y + ring });
    builders.push(createPlayerHumanUnit(world, 'builder', at.x, at.y, coreId));
  }
  const soldiers: EntityId[] = [];
  for (let i = 0; i < PLAYER_HUMAN_START.soldiers; i++) {
    const at = nearestWalkable(grid, { x: center.x + ring, y: center.y - 1 + i * 2 });
    soldiers.push(createPlayerHumanUnit(world, 'soldier', at.x, at.y, coreId));
  }
  world.minerals.deposit(PLAYER_HUMAN_START.minerals);
  const minerals = options.homeField === false ? [] : spawnHomeMineralField(world, grid, center);
  let barracksId: EntityId | null = null;
  if (options.barracks !== false) {
    const units = [...builders, ...soldiers].map((id) => positionOf(world, id)!);
    const spot = startBuildingSpot('barracks', center, placementWorldOf(world, grid), units);
    if (spot) barracksId = createPlayerHumanBuilding(world, 'barracks', spot.x, spot.y);
  }
  return { coreId, builders, soldiers, barracksId, minerals };
}
