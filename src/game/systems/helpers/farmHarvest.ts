// Farm harvest: the visible job that moves ripe mushrooms off the fungus farm.
//
// Before this, farm mushrooms were only ever taken implicitly (nurses fetching
// for the queen and larvae, ants eating), so the player never saw anyone work
// the farm. Now a free nurse walks to a RIPE tile (a full pile), picks for
// about a second, and carries the load to the pantry. Food is moved, never
// made or lost: what leaves the farm tile lands on a pantry pile (or stays on
// her back, where the nurse AI uses it like any fetched food).

import type { World } from '../../../engine/ecs/World';
import type { UndergroundGrid } from '../../../simulation/world/UndergroundGrid';
import {
  COMPONENT,
  AntState,
  type AntComponent,
  type CarryingComponent,
  type HungerComponent,
  type PositionComponent,
} from '../../components/components';
import { isFarmTileReady } from '../../render/fungusGrowth';

/** How long the "cosechando" pose holds at the tile */
export const FARM_HARVEST_POSE_SECONDS = 1;
/** Share of the pantry kept free for incoming leaves: harvesters stop above it */
export const FARM_HARVEST_PANTRY_RESERVE = 0.25;
/** At most this many ants harvest at once (never more than there are ripe tiles) */
export const FARM_HARVEST_MAX_WORKERS = 2;

const REACH = 0.9;
const DEPOSIT_REACH = 1.5;

export interface FarmNav {
  setPath(id: number, pos: PositionComponent, x: number, y: number): void;
  clearPath(id: number): void;
}

/** Room in the pantry for a harvest without crowding out the leaves the farm feeds on */
export function pantryCanTakeHarvest(grid: UndergroundGrid, load: number): boolean {
  const capacity = grid.getPantryCapacity();
  if (capacity <= 0 || !grid.hasDepositSpace(['mushroom'])) return false;
  let stored = 0;
  for (const t of grid.getPantryTiles()) stored += t.food?.amount ?? 0;
  return capacity - stored - load >= capacity * FARM_HARVEST_PANTRY_RESERVE;
}

/** Tiles other harvesters already claimed */
function claimedTiles(world: World, excludeId: number): Set<number> {
  const claimed = new Set<number>();
  for (const id of world.query(COMPONENT.ANT)) {
    if (id === excludeId) continue;
    const ant = world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
    const job = ant.farmHarvest;
    if (ant.state === AntState.FarmHarvesting && job && job.phase !== 'carrying') claimed.add(job.tileY * 4096 + job.tileX);
  }
  return claimed;
}

/** How many ants are on a harvest trip right now (other than `excludeId`) */
export function countHarvesters(world: World, excludeId: number): number {
  let n = 0;
  for (const id of world.query(COMPONENT.ANT)) {
    if (id === excludeId) continue;
    if (world.getComponent<AntComponent>(id, COMPONENT.ANT)!.state === AntState.FarmHarvesting) n++;
  }
  return n;
}

/** Nearest ripe farm tile nobody else is harvesting */
export function findHarvestTile(
  world: World,
  grid: UndergroundGrid,
  excludeId: number,
  fromX: number,
  fromY: number,
): { x: number; y: number } | null {
  const cap = grid.getPantryTileCapacity();
  let claimed: Set<number> | null = null;
  let best: { x: number; y: number } | null = null;
  let bestDist = Infinity;
  for (const t of grid.getFarmTiles()) {
    if (!t.food || !isFarmTileReady(t.food.amount, cap)) continue;
    claimed ??= claimedTiles(world, excludeId);
    if (claimed.has(t.y * 4096 + t.x)) continue;
    const dx = t.x + 0.5 - fromX;
    const dy = t.y + 0.5 - fromY;
    const d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      best = { x: t.x, y: t.y };
    }
  }
  return best;
}

/** Start a harvest trip if there is a ripe tile, pantry room and a free harvester slot */
export function tryStartFarmHarvest(
  world: World,
  grid: UndergroundGrid,
  id: number,
  ant: AntComponent,
  pos: PositionComponent,
  nav: FarmNav,
): boolean {
  const carrying = world.getComponent<CarryingComponent>(id, COMPONENT.CARRYING);
  if (!carrying || carrying.amount > 0 || grid.getFarmTiles().length === 0) return false;
  if (!pantryCanTakeHarvest(grid, carrying.maxCapacity)) return false;
  const tile = findHarvestTile(world, grid, id, pos.x, pos.y);
  if (!tile) return false;
  if (countHarvesters(world, id) >= FARM_HARVEST_MAX_WORKERS) return false;

  ant.state = AntState.FarmHarvesting;
  ant.stateTimer = 0;
  ant.farmHarvest = { tileX: tile.x, tileY: tile.y, phase: 'going', timer: 0 };
  nav.clearPath(id);
  nav.setPath(id, pos, tile.x + 0.5, tile.y + 0.5);
  return true;
}

function finish(ant: AntComponent, nav: FarmNav, id: number): void {
  ant.state = AntState.Idle;
  ant.stateTimer = 0;
  ant.farmHarvest = null;
  nav.clearPath(id);
}

/** Advance one harvest trip: going → picking (pose) → carrying → back to Idle */
export function updateFarmHarvest(
  world: World,
  grid: UndergroundGrid,
  id: number,
  ant: AntComponent,
  pos: PositionComponent,
  dt: number,
  nav: FarmNav,
): void {
  const job = ant.farmHarvest;
  const carrying = world.getComponent<CarryingComponent>(id, COMPONENT.CARRYING);
  if (!job || !carrying) {
    finish(ant, nav, id);
    return;
  }
  job.timer += dt;

  if (job.phase === 'going') {
    // Hunger outranks the farm: drop the trip before anything is picked
    const hunger = world.getComponent<HungerComponent>(id, COMPONENT.HUNGER);
    const tile = grid.getTile(job.tileX, job.tileY);
    if ((hunger && hunger.current < hunger.max * 0.35) || !tile?.food || tile.food.type !== 'mushroom' || tile.food.amount <= 0) {
      finish(ant, nav, id);
      return;
    }
    const dx = job.tileX + 0.5 - pos.x;
    const dy = job.tileY + 0.5 - pos.y;
    if (dx * dx + dy * dy > REACH * REACH) {
      nav.setPath(id, pos, job.tileX + 0.5, job.tileY + 0.5);
      return;
    }
    // Pluck: the pile shrinks now (the renderer hears it from the grid) and
    // the load rides on her back through the pose
    const { taken } = grid.takeFood(job.tileX, job.tileY, carrying.maxCapacity - carrying.amount);
    if (taken <= 0) {
      finish(ant, nav, id);
      return;
    }
    carrying.amount += taken;
    carrying.resourceType = 'mushroom';
    job.phase = 'picking';
    job.timer = 0;
    nav.clearPath(id);
    return;
  }

  if (job.phase === 'picking') {
    if (job.timer >= FARM_HARVEST_POSE_SECONDS) {
      job.phase = 'carrying';
      job.timer = 0;
    }
    return;
  }

  // Carrying: to the nearest pantry pile that takes mushrooms
  if (carrying.amount <= 0) {
    finish(ant, nav, id);
    return;
  }
  const dest = grid.findDepositTile('mushroom', pos.x, pos.y);
  if (!dest) {
    // Pantry filled up on the way: she keeps the load (nurses feed with it)
    finish(ant, nav, id);
    return;
  }
  const dx = dest.x + 0.5 - pos.x;
  const dy = dest.y + 0.5 - pos.y;
  if (dx * dx + dy * dy > DEPOSIT_REACH * DEPOSIT_REACH) {
    nav.setPath(id, pos, dest.x + 0.5, dest.y + 0.5);
    return;
  }
  const accepted = grid.depositFood(dest.x, dest.y, 'mushroom', carrying.amount);
  carrying.amount -= accepted;
  if (carrying.amount <= 1e-6) {
    carrying.amount = 0;
    carrying.resourceType = null;
    finish(ant, nav, id);
  }
  // Leftover: the next tick heads for the next pile with room
}
