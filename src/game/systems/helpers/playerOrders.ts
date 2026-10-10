import type { World } from '../../../engine/ecs/World';
import type { EntityId, Vector2 } from '../../../shared/types';
import type { PathGrid } from '../../../simulation/pathfinding/AStar';
import type { TransitSystem } from '../TransitSystem';
import {
  COMPONENT,
  AntState,
  Layer,
  OrderKind,
  type AntComponent,
  type CombatComponent,
  type LayerComponent,
  type PathComponent,
  type PlayerOrderComponent,
  type PositionComponent,
} from '../../components/components';
import { ORDER_SNAP_RADIUS } from '../../../shared/constants';

/**
 * Player orders: the StarCraft-style move command and its stop. These helpers
 * write the PlayerOrder component; AntAISystem walks the ant there, and every
 * colony system that recruits ants skips the ones holding an order.
 */

const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1],
];

export function hasPlayerOrder(world: World, id: EntityId): boolean {
  return world.getComponent<PlayerOrderComponent>(id, COMPONENT.PLAYER_ORDER) !== undefined;
}

/** The walkable tile closest to `target` within `radius` tiles, or null. */
export function snapToWalkable(grid: PathGrid, target: Vector2, radius: number): Vector2 | null {
  const cx = Math.round(target.x);
  const cy = Math.round(target.y);
  if (grid.isWalkable(cx, cy)) return { x: cx, y: cy };
  let best: Vector2 | null = null;
  let bestDist = Infinity;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const d = dx * dx + dy * dy;
      if (d >= bestDist || d > radius * radius) continue;
      if (!grid.isWalkable(cx + dx, cy + dy)) continue;
      best = { x: cx + dx, y: cy + dy };
      bestDist = d;
    }
  }
  return best;
}

/**
 * `count` distinct walkable tiles around `center`, closest first: a compact
 * disc, so a group arrives as a clump instead of stacking on one tile. Only
 * tiles the center can walk to count (8-way, no corner cutting, like A*), so a
 * slot never lands behind a wall. Fewer come back when the pocket is smaller.
 */
export function formationSlots(grid: PathGrid, center: Vector2, count: number): Vector2[] {
  const cx = Math.round(center.x);
  const cy = Math.round(center.y);
  if (count <= 0 || !grid.isWalkable(cx, cy)) return [];

  let depth = Math.ceil(Math.sqrt(count / Math.PI)) + 2;
  for (;;) {
    const reached = reachableWithin(grid, cx, cy, depth);
    if (reached.length >= count || depth >= 24) {
      reached.sort((a, b) => {
        const da = (a.x - cx) ** 2 + (a.y - cy) ** 2;
        const db = (b.x - cx) ** 2 + (b.y - cy) ** 2;
        return da - db || a.y - b.y || a.x - b.x;
      });
      return reached.slice(0, count);
    }
    depth += 3;
  }
}

/** Breadth-first flood over walkable tiles up to `depth` steps from (cx, cy). */
function reachableWithin(grid: PathGrid, cx: number, cy: number, depth: number): Vector2[] {
  const seen = new Set<number>([key(cx, cy)]);
  const out: Vector2[] = [{ x: cx, y: cy }];
  let frontier: Vector2[] = [{ x: cx, y: cy }];
  for (let step = 0; step < depth && frontier.length > 0; step++) {
    const next: Vector2[] = [];
    for (const tile of frontier) {
      for (const [dx, dy] of NEIGHBORS) {
        const nx = tile.x + dx;
        const ny = tile.y + dy;
        const k = key(nx, ny);
        if (seen.has(k) || !grid.isWalkable(nx, ny)) continue;
        if (dx !== 0 && dy !== 0 && (!grid.isWalkable(tile.x + dx, tile.y) || !grid.isWalkable(tile.x, tile.y + dy))) continue;
        seen.add(k);
        const reached = { x: nx, y: ny };
        out.push(reached);
        next.push(reached);
      }
    }
    frontier = next;
  }
  return out;
}

function key(x: number, y: number): number {
  return (y + 0x8000) * 0x10000 + (x + 0x8000);
}

export interface MoveOrderResult {
  /** Ants that took the order */
  ordered: EntityId[];
  /** The tile the group heads for (the click, snapped onto walkable ground) */
  target: Vector2;
}

/**
 * Give every own surface ant in `ids` a move order to its own formation slot
 * around `target`. The nearest ant takes the center slot, the farthest the
 * outer ring. Returns null when nobody can take it or the ground is solid rock.
 */
export function issueMoveOrders(
  world: World,
  grid: PathGrid,
  ids: readonly EntityId[],
  target: Vector2,
  transit?: TransitSystem | null,
): MoveOrderResult | null {
  const units: Array<{ id: EntityId; dist: number }> = [];
  for (const id of ids) {
    const ant = world.getComponent<AntComponent>(id, COMPONENT.ANT);
    const layer = world.getComponent<LayerComponent>(id, COMPONENT.LAYER);
    const pos = world.getComponent<PositionComponent>(id, COMPONENT.POSITION);
    if (!ant || !pos || !world.getComponent(id, COMPONENT.PATH)) continue;
    if (layer && layer.layer !== Layer.Surface) continue;
    units.push({ id, dist: Math.hypot(pos.x - target.x, pos.y - target.y) });
  }
  if (units.length === 0) return null;

  const goal = snapToWalkable(grid, target, ORDER_SNAP_RADIUS);
  if (!goal) return null;
  const slots = formationSlots(grid, goal, units.length);
  if (slots.length === 0) return null;

  units.sort((a, b) => a.dist - b.dist || a.id - b.id);
  units.forEach(({ id }, i) => {
    const slot = slots[i % slots.length];
    // A ride down the shaft is called off: the player wants the ant up here
    transit?.cancelEnter(id);
    abandonCurrentTask(world, id);
    const ant = world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
    ant.state = AntState.Moving;
    world.addComponent<PlayerOrderComponent>(id, COMPONENT.PLAYER_ORDER, {
      kind: OrderKind.Move,
      target: { x: slot.x, y: slot.y },
      layer: Layer.Surface,
      elapsed: 0,
      routes: 0,
    });
  });
  return { ordered: units.map((u) => u.id), target: goal };
}

/**
 * End an ant's order: it goes Idle and its own AI picks its job back up next
 * tick (a loaded worker heads home, a soldier looks for trouble).
 */
export function endPlayerOrder(world: World, id: EntityId): void {
  world.removeComponent(id, COMPONENT.PLAYER_ORDER);
  const ant = world.getComponent<AntComponent>(id, COMPONENT.ANT);
  if (!ant) return;
  if (ant.state === AntState.Moving) ant.state = AntState.Idle;
  ant.stateTimer = 0;
  clearPath(world, id);
  // Restart stall detection here, so the stuck nets do not fire on the first tick
  const pos = world.getComponent<PositionComponent>(id, COMPONENT.POSITION);
  ant.stuckTimer = 0;
  if (pos) {
    ant.lastX = pos.x;
    ant.lastY = pos.y;
  }
}

/**
 * The Detener command: drop the player's orders on these ants (move orders and
 * the den-attack dispatch). Ants running on their own AI are left alone.
 * Returns how many ants stopped.
 */
export function stopAnts(world: World, ids: readonly EntityId[]): number {
  let stopped = 0;
  for (const id of ids) {
    const ant = world.getComponent<AntComponent>(id, COMPONENT.ANT);
    if (!ant) continue;
    if (hasPlayerOrder(world, id)) {
      endPlayerOrder(world, id);
      stopped++;
    } else if (ant.commandTargetId !== null && (ant.state === AntState.GoingToDen || ant.state === AntState.AttackingDen)) {
      abandonCurrentTask(world, id);
      ant.state = AntState.Idle;
      stopped++;
    }
  }
  return stopped;
}

/** Drop the target, the den command and the route; the caller sets the new state. */
function abandonCurrentTask(world: World, id: EntityId): void {
  const ant = world.getComponent<AntComponent>(id, COMPONENT.ANT);
  if (ant) {
    ant.commandTargetId = null;
    ant.stateTimer = 0;
  }
  const combat = world.getComponent<CombatComponent>(id, COMPONENT.COMBAT);
  if (combat) combat.targetEntityId = null;
  clearPath(world, id);
}

function clearPath(world: World, id: EntityId): void {
  const path = world.getComponent<PathComponent>(id, COMPONENT.PATH);
  if (path) {
    path.waypoints = [];
    path.currentIndex = 0;
  }
}
