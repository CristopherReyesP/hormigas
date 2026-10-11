// Farm tending: the visible job that feeds the fungus farm.
//
// Leafcutter gardeners do not eat their leaves: they chew them into mulch and
// lay it on the fungus garden, and the fungus grows on it. Here a free nurse
// takes a load of leaves from the pantry, walks to the farm tile whose mulch
// runs lowest, kneels over it for a moment and lays the leaves down. The
// FungusFarmSystem then grows that tile's mushrooms from its mulch. Food is
// moved, never made or lost: leaves leave the pantry and land on the tile (or
// stay on her back, where the nurse AI uses them like any fetched food).

import type { World } from '../../../engine/ecs/World';
import type { UndergroundGrid } from '../../../simulation/world/UndergroundGrid';
import { FARM_MULCH_CAPACITY, FUNGUS_YIELD } from '../../../shared/constants';
import {
  COMPONENT,
  AntState,
  type AntComponent,
  type CarryingComponent,
  type HungerComponent,
  type PositionComponent,
} from '../../components/components';
import { isFarmTileReady } from '../../render/fungusGrowth';
import type { FarmNav } from './farmHarvest';

/** How long the "cultivando" pose holds over the tile */
export const FARM_TEND_POSE_SECONDS = 1.2;
/** At most this many ants tend the farm at once */
export const FARM_TEND_MAX_WORKERS = 2;

const REACH = 0.9;
const PANTRY_REACH = 1.5;

/** Leaves other gardeners are bringing to each bed (a load still being fetched counts as a full one) */
function inFlightLeaves(world: World, excludeId: number): Map<number, number> {
  const loads = new Map<number, number>();
  for (const id of world.query(COMPONENT.ANT)) {
    if (id === excludeId) continue;
    const ant = world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
    const job = ant.farmTend;
    if (ant.state !== AntState.FarmTending || !job) continue;
    const carrying = world.getComponent<CarryingComponent>(id, COMPONENT.CARRYING);
    const load = job.phase === 'fetching' ? carrying?.maxCapacity ?? 0 : carrying?.amount ?? 0;
    const key = job.tileY * 4096 + job.tileX;
    loads.set(key, (loads.get(key) ?? 0) + load);
  }
  return loads;
}

/** How many ants are on a gardening trip right now (other than `excludeId`) */
export function countGardeners(world: World, excludeId: number): number {
  let n = 0;
  for (const id of world.query(COMPONENT.ANT)) {
    if (id === excludeId) continue;
    if (world.getComponent<AntComponent>(id, COMPONENT.ANT)!.state === AntState.FarmTending) n++;
  }
  return n;
}

/**
 * The farm bed to mulch next: not ripe and with room for mulch, counting the
 * leaves other gardeners are already bringing. The most grown bed comes first
 * (nearest on ties) and several gardeners may feed the same one, so beds ripen
 * one after another instead of a scarce leaf supply spreading thin.
 */
export function findTendTile(
  world: World,
  grid: UndergroundGrid,
  excludeId: number,
  fromX: number,
  fromY: number,
): { x: number; y: number } | null {
  const cap = grid.getPantryTileCapacity();
  let incoming: Map<number, number> | null = null;
  let best: { x: number; y: number } | null = null;
  let bestScore = Infinity;
  for (const t of grid.getFarmTiles()) {
    const grown = t.food?.amount ?? 0;
    if (isFarmTileReady(grown, cap)) continue;
    incoming ??= inFlightLeaves(world, excludeId);
    const mulch = grid.getFarmMulch(t.x, t.y) + (incoming.get(t.y * 4096 + t.x) ?? 0);
    if (mulch >= FARM_MULCH_CAPACITY - 1e-6) continue;
    // What the bed will have grown once its mulch is eaten
    const promised = grown + mulch * FUNGUS_YIELD;
    if (promised >= cap) continue;
    const dx = t.x + 0.5 - fromX;
    const dy = t.y + 0.5 - fromY;
    const score = (cap - promised) * 1000 + dx * dx + dy * dy;
    if (score < bestScore) {
      bestScore = score;
      best = { x: t.x, y: t.y };
    }
  }
  return best;
}

/** Start a gardening trip if leaves are stored, a tile needs mulch and a gardener slot is free */
export function tryStartFarmTending(
  world: World,
  grid: UndergroundGrid,
  id: number,
  ant: AntComponent,
  pos: PositionComponent,
  nav: FarmNav,
): boolean {
  const carrying = world.getComponent<CarryingComponent>(id, COMPONENT.CARRYING);
  if (!carrying || grid.getFarmTiles().length === 0) return false;
  // Already holding leaves (left over from a trip): skip the pantry
  const holdingLeaves = carrying.amount > 0 && carrying.resourceType === 'leaf';
  if (carrying.amount > 0 && !holdingLeaves) return false;
  if (!holdingLeaves && grid.getPantryStored().leaf <= 0) return false;
  if (countGardeners(world, id) >= FARM_TEND_MAX_WORKERS) return false;
  const tile = findTendTile(world, grid, id, pos.x, pos.y);
  if (!tile) return false;

  ant.state = AntState.FarmTending;
  ant.stateTimer = 0;
  ant.farmTend = { tileX: tile.x, tileY: tile.y, phase: holdingLeaves ? 'going' : 'fetching', timer: 0 };
  nav.clearPath(id);
  return true;
}

function finish(ant: AntComponent, nav: FarmNav, id: number): void {
  ant.state = AntState.Idle;
  ant.stateTimer = 0;
  ant.farmTend = null;
  nav.clearPath(id);
}

function near(pos: PositionComponent, x: number, y: number, reach: number): boolean {
  const dx = x + 0.5 - pos.x;
  const dy = y + 0.5 - pos.y;
  return dx * dx + dy * dy <= reach * reach;
}

/** Advance one gardening trip: fetching leaves → going to the tile → planting (pose) → back to Idle */
export function updateFarmTending(
  world: World,
  grid: UndergroundGrid,
  id: number,
  ant: AntComponent,
  pos: PositionComponent,
  dt: number,
  nav: FarmNav,
): void {
  const job = ant.farmTend;
  const carrying = world.getComponent<CarryingComponent>(id, COMPONENT.CARRYING);
  if (!job || !carrying) {
    finish(ant, nav, id);
    return;
  }
  job.timer += dt;

  if (job.phase === 'fetching') {
    // Hunger outranks the farm: drop the trip before anything is taken
    const hunger = world.getComponent<HungerComponent>(id, COMPONENT.HUNGER);
    if (hunger && hunger.current < hunger.max * 0.35) {
      finish(ant, nav, id);
      return;
    }
    const src = grid.findFetchTile('leaf', pos.x, pos.y);
    if (!src || !grid.isFarmTileAt(job.tileX, job.tileY)) {
      finish(ant, nav, id);
      return;
    }
    if (!near(pos, src.x, src.y, PANTRY_REACH)) {
      nav.setPath(id, pos, src.x + 0.5, src.y + 0.5);
      return;
    }
    const room = FARM_MULCH_CAPACITY - grid.getFarmMulch(job.tileX, job.tileY);
    const { taken } = grid.takeFood(src.x, src.y, Math.min(carrying.maxCapacity, room));
    if (taken <= 0) {
      finish(ant, nav, id);
      return;
    }
    carrying.amount += taken;
    carrying.resourceType = 'leaf';
    job.phase = 'going';
    job.timer = 0;
    nav.clearPath(id);
    return;
  }

  if (job.phase === 'going') {
    if (carrying.amount <= 0 || !grid.isFarmTileAt(job.tileX, job.tileY)) {
      finish(ant, nav, id);
      return;
    }
    if (!near(pos, job.tileX, job.tileY, REACH)) {
      nav.setPath(id, pos, job.tileX + 0.5, job.tileY + 0.5);
      return;
    }
    job.phase = 'planting';
    job.timer = 0;
    nav.clearPath(id);
    return;
  }

  // Planting: chew and lay the leaves once the pose ends
  if (job.timer < FARM_TEND_POSE_SECONDS) return;
  const laid = grid.addFarmMulch(job.tileX, job.tileY, carrying.amount);
  carrying.amount -= laid;
  if (carrying.amount <= 1e-6) {
    carrying.amount = 0;
    carrying.resourceType = null;
  }
  // Leftover leaves (the bed filled up): she keeps them for the next trip
  finish(ant, nav, id);
}
