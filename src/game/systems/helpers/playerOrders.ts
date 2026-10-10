import type { World } from '../../../engine/ecs/World';
import type { EntityId, Vector2 } from '../../../shared/types';
import type { PathGrid } from '../../../simulation/pathfinding/AStar';
import type { TransitSystem } from '../TransitSystem';
import {
  COMPONENT,
  AntRole,
  AntState,
  Layer,
  OrderKind,
  type AntComponent,
  type CombatComponent,
  type HealthComponent,
  type LayerComponent,
  type PathComponent,
  type PlayerOrderComponent,
  type PositionComponent,
  type RenderComponent,
} from '../../components/components';
import { ENEMY_PICK_RADIUS, ORDER_SNAP_RADIUS } from '../../../shared/constants';
import { FactionId, isHostileTo } from '../../factions/factions';

/**
 * Player orders, StarCraft style: move, attack a target, attack-move, hold
 * position, the guard post a warrior keeps afterwards, and stop. These helpers
 * write the PlayerOrder component; AntAISystem carries the order out, and every
 * colony system that recruits ants skips the ones holding an order.
 */

const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1],
];

export function hasPlayerOrder(world: World, id: EntityId): boolean {
  return world.getComponent<PlayerOrderComponent>(id, COMPONENT.PLAYER_ORDER) !== undefined;
}

/** An order still under way (move, attack, attack-move); the hold and guard stances are not. */
export function hasActiveOrder(world: World, id: EntityId): boolean {
  const kind = world.getComponent<PlayerOrderComponent>(id, COMPONENT.PLAYER_ORDER)?.kind;
  return kind === OrderKind.Move || kind === OrderKind.Attack || kind === OrderKind.AttackMove;
}

/** Castes that keep the spot an order left them on; workers go back to work instead. */
export function isWarrior(role: AntRole): boolean {
  return role === AntRole.Soldier || role === AntRole.Scout || role === AntRole.Defender;
}

/** Ants that deal damage. Scouts bite for nothing, so they walk where they are told and never fight. */
export function canFight(world: World, id: EntityId): boolean {
  return (world.getComponent<HealthComponent>(id, COMPONENT.HEALTH)?.damage ?? 0) > 0;
}

/** The enemy kinds an attack order can name. */
const ENEMY_STORES = [
  COMPONENT.BEETLE,
  COMPONENT.CRICKET,
  COMPONENT.BEETLE_DEN,
  COMPONENT.CRICKET_DEN,
  COMPONENT.CRYSTAL_UNIT,
  COMPONENT.CRYSTAL_HIVE,
] as const;

/** Structures: drawn and clickable on explored ground, the target of a den attack wave. */
const STRUCTURE_STORES: ReadonlySet<string> = new Set([COMPONENT.BEETLE_DEN, COMPONENT.CRICKET_DEN, COMPONENT.CRYSTAL_HIVE]);

/**
 * A beetle, cricket, den, or a rival faction's unit or hive on the surface:
 * something the player's attack order may name.
 */
export function isSurfaceEnemy(world: World, id: EntityId): boolean {
  if (!world.hasEntity(id)) return false;
  if (!ENEMY_STORES.some((store) => world.getComponent(id, store) !== undefined)) return false;
  if (!isHostileTo(world, FactionId.PLAYER, id)) return false;
  const layer = world.getComponent<LayerComponent>(id, COMPONENT.LAYER);
  return !layer || layer.layer === Layer.Surface;
}

function isDen(world: World, id: EntityId): boolean {
  for (const store of STRUCTURE_STORES) if (world.getComponent(id, store) !== undefined) return true;
  return false;
}

/**
 * The surface enemy a right-click at `at` (entity-position space) lands on, or
 * null: the nearest one within ENEMY_PICK_RADIUS, or within its own size for
 * a big sprite like the cricket. `canSee` is the fog rule: the renderer draws wildlife only
 * where the colony sees now and dens on explored ground, and only what the
 * player can see can be clicked.
 */
export function findEnemyAt(
  world: World,
  at: Vector2,
  canSee: (x: number, y: number, den: boolean) => boolean,
): EntityId | null {
  let best: EntityId | null = null;
  let bestDist = Infinity;
  for (const store of ENEMY_STORES) {
    for (const id of world.query(store, COMPONENT.POSITION)) {
      if (!isSurfaceEnemy(world, id)) continue;
      const pos = world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      const den = STRUCTURE_STORES.has(store);
      // Big sprites (the cricket) are hit anywhere on their body
      const reach = Math.max(ENEMY_PICK_RADIUS, world.getComponent<RenderComponent>(id, COMPONENT.RENDER)?.radius ?? 0);
      const dist = Math.hypot(pos.x - at.x, pos.y - at.y);
      if (dist > reach || dist >= bestDist) continue;
      if (!canSee(Math.round(pos.x), Math.round(pos.y), den)) continue;
      best = id;
      bestDist = dist;
    }
  }
  return best;
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

/** Own surface ants among `ids` that can take an order, with their distance to `target`. */
function orderableUnits(world: World, ids: readonly EntityId[], target: Vector2): Array<{ id: EntityId; dist: number }> {
  const units: Array<{ id: EntityId; dist: number }> = [];
  for (const id of ids) {
    const ant = world.getComponent<AntComponent>(id, COMPONENT.ANT);
    const layer = world.getComponent<LayerComponent>(id, COMPONENT.LAYER);
    const pos = world.getComponent<PositionComponent>(id, COMPONENT.POSITION);
    if (!ant || !pos || !world.getComponent(id, COMPONENT.PATH)) continue;
    if (layer && layer.layer !== Layer.Surface) continue;
    units.push({ id, dist: Math.hypot(pos.x - target.x, pos.y - target.y) });
  }
  return units;
}

/** Write the order on an ant: whatever it was doing (a ride down, a target, a route) is dropped. */
function assignOrder(
  world: World,
  id: EntityId,
  kind: OrderKind,
  target: Vector2,
  targetId: EntityId | null,
  transit?: TransitSystem | null,
): void {
  // A ride down the shaft is called off: the player wants the ant up here
  transit?.cancelEnter(id);
  abandonCurrentTask(world, id);
  const ant = world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
  ant.state = kind === OrderKind.Hold ? AntState.Holding : AntState.Moving;
  world.addComponent<PlayerOrderComponent>(id, COMPONENT.PLAYER_ORDER, {
    kind,
    target: { x: target.x, y: target.y },
    targetId,
    repath: 0,
    layer: Layer.Surface,
    elapsed: 0,
    routes: 0,
  });
}

/**
 * Give every own surface ant in `ids` a move (or attack-move) order to its own
 * formation slot around `target`. The nearest ant takes the center slot, the
 * farthest the outer ring. Returns null when nobody can take it or the ground
 * is solid rock.
 */
export function issueMoveOrders(
  world: World,
  grid: PathGrid,
  ids: readonly EntityId[],
  target: Vector2,
  transit?: TransitSystem | null,
  kind: typeof OrderKind.Move | typeof OrderKind.AttackMove = OrderKind.Move,
): MoveOrderResult | null {
  const units = orderableUnits(world, ids, target);
  if (units.length === 0) return null;

  const goal = snapToWalkable(grid, target, ORDER_SNAP_RADIUS);
  if (!goal) return null;
  const slots = formationSlots(grid, goal, units.length);
  if (slots.length === 0) return null;

  units.sort((a, b) => a.dist - b.dist || a.id - b.id);
  units.forEach(({ id }, i) => assignOrder(world, id, kind, slots[i % slots.length], null, transit));
  return { ordered: units.map((u) => u.id), target: goal };
}

/**
 * Order the own surface ants in `ids` to attack one enemy (a beetle, cricket
 * or den) until it dies. Ants that cannot fight (scouts) take a move order to
 * the enemy's spot instead, so a mixed group still goes together. Returns null
 * when the target is not a surface enemy or nobody can take the order.
 */
export function issueAttackOrders(
  world: World,
  grid: PathGrid,
  ids: readonly EntityId[],
  targetId: EntityId,
  transit?: TransitSystem | null,
): MoveOrderResult | null {
  if (!isSurfaceEnemy(world, targetId)) return null;
  const at = world.getComponent<PositionComponent>(targetId, COMPONENT.POSITION);
  if (!at) return null;
  const target = { x: at.x, y: at.y };
  const units = orderableUnits(world, ids, target);
  const fighters = units.filter(({ id }) => canFight(world, id)).map(({ id }) => id);
  const followers = units.filter(({ id }) => !canFight(world, id)).map(({ id }) => id);
  for (const id of fighters) assignOrder(world, id, OrderKind.Attack, target, targetId, transit);
  const followed = followers.length > 0 ? issueMoveOrders(world, grid, followers, target, transit) : null;
  const ordered = [...fighters, ...(followed?.ordered ?? [])];
  return ordered.length > 0 ? { ordered, target: { x: Math.round(target.x), y: Math.round(target.y) } } : null;
}

/**
 * Mantener posición: every own surface ant in `ids` stands where it is and
 * fights only enemies inside its attack range. Returns the ants that took it.
 */
export function issueHoldOrders(world: World, ids: readonly EntityId[], transit?: TransitSystem | null): EntityId[] {
  const held: EntityId[] = [];
  for (const { id } of orderableUnits(world, ids, { x: 0, y: 0 })) {
    const pos = world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
    assignOrder(world, id, OrderKind.Hold, { x: pos.x, y: pos.y }, null, transit);
    held.push(id);
  }
  return held;
}

/**
 * An order is done (arrived, or the attacked enemy is dead). A warrior keeps
 * the spot as its guard post: it fights what comes near and walks back. Any
 * other caste ends the order and goes back to its job.
 */
export function completePlayerOrder(world: World, id: EntityId): void {
  const ant = world.getComponent<AntComponent>(id, COMPONENT.ANT);
  const order = world.getComponent<PlayerOrderComponent>(id, COMPONENT.PLAYER_ORDER);
  const pos = world.getComponent<PositionComponent>(id, COMPONENT.POSITION);
  if (!ant || !order || !pos || !isWarrior(ant.role)) {
    endPlayerOrder(world, id);
    return;
  }
  order.kind = OrderKind.Guard;
  order.target = { x: pos.x, y: pos.y };
  order.targetId = null;
  order.elapsed = 0;
  order.routes = 0;
  order.repath = 0;
  ant.state = AntState.Guarding;
  ant.stateTimer = 0;
  clearCombatTarget(world, id);
  clearPath(world, id);
}

/** States only an order sets; once it ends they mean nothing to the colony AI. */
const ORDER_STATES: ReadonlySet<AntState> = new Set([
  AntState.Moving,
  AntState.Guarding,
  AntState.Holding,
  AntState.ChasingEnemy,
  AntState.AttackingEnemy,
]);

/**
 * End an ant's order: it goes Idle and its own AI picks its job back up next
 * tick (a loaded worker heads home, a soldier looks for trouble).
 */
export function endPlayerOrder(world: World, id: EntityId): void {
  const hadOrder = hasPlayerOrder(world, id);
  world.removeComponent(id, COMPONENT.PLAYER_ORDER);
  const ant = world.getComponent<AntComponent>(id, COMPONENT.ANT);
  if (!ant) return;
  if (hadOrder && ORDER_STATES.has(ant.state)) ant.state = AntState.Idle;
  ant.stateTimer = 0;
  clearPath(world, id);
  if (hadOrder) clearCombatTarget(world, id);
  // Restart stall detection here, so the stuck nets do not fire on the first tick
  const pos = world.getComponent<PositionComponent>(id, COMPONENT.POSITION);
  ant.stuckTimer = 0;
  if (pos) {
    ant.lastX = pos.x;
    ant.lastY = pos.y;
  }
}

/**
 * The Detener command: drop every player order on these ants (move, attack,
 * hold, guard). Ants running on their own AI are left alone. Returns how many
 * ants stopped.
 */
export function stopAnts(world: World, ids: readonly EntityId[]): number {
  let stopped = 0;
  for (const id of ids) {
    if (!hasPlayerOrder(world, id)) continue;
    endPlayerOrder(world, id);
    stopped++;
  }
  return stopped;
}

/** A surface soldier with no order, idling, foraging or patrolling: free for the den attack. */
export function isFreeSoldier(world: World, id: EntityId): boolean {
  const ant = world.getComponent<AntComponent>(id, COMPONENT.ANT);
  if (!ant || ant.role !== AntRole.Soldier || hasPlayerOrder(world, id)) return false;
  const layer = world.getComponent<LayerComponent>(id, COMPONENT.LAYER);
  if (layer && layer.layer !== Layer.Surface) return false;
  return ant.state === AntState.Idle || ant.state === AntState.Searching || ant.state === AntState.PatrollingNest;
}

/**
 * The den attack wave (Atacar guarida): the `count` free soldiers closest to
 * the den get an attack order on it. Returns the soldiers sent, closest first;
 * none when `denId` is not a den.
 */
export function dispatchDenAttack(
  world: World,
  grid: PathGrid,
  denId: EntityId,
  count: number,
  transit?: TransitSystem | null,
): EntityId[] {
  if (!isSurfaceEnemy(world, denId) || !isDen(world, denId)) return [];
  const denPos = world.getComponent<PositionComponent>(denId, COMPONENT.POSITION);
  if (!denPos) return [];
  const free = world
    .query(COMPONENT.ANT, COMPONENT.POSITION)
    .filter((id) => isFreeSoldier(world, id))
    .map((id) => {
      const pos = world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      return { id, dist: Math.hypot(pos.x - denPos.x, pos.y - denPos.y) };
    })
    .sort((a, b) => a.dist - b.dist || a.id - b.id)
    .slice(0, Math.max(0, count))
    .map(({ id }) => id);
  if (free.length === 0) return [];
  return issueAttackOrders(world, grid, free, denId, transit)?.ordered ?? [];
}

/**
 * The retreat horn: it outranks every player order. Surface soldiers go back
 * to patrol the nest and everybody else heads home; porters keep their load
 * and task (they are heading to the nest or below anyway, and re-typing their
 * state would double-count food). Returns how many ants were recalled.
 */
export function soundRetreatHorn(world: World): number {
  let recalled = 0;
  for (const id of world.query(COMPONENT.ANT, COMPONENT.LAYER)) {
    const layer = world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!;
    if (layer.layer !== Layer.Surface) continue;
    const ant = world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
    if (hasPlayerOrder(world, id)) endPlayerOrder(world, id);
    if (ant.state === AntState.FetchingFood || ant.state === AntState.Hauling) continue;
    ant.state = ant.role === AntRole.Soldier ? AntState.PatrollingNest : AntState.ReturningHome;
    ant.stateTimer = 0;
    clearPath(world, id);
    recalled++;
  }
  return recalled;
}

/** Drop the target and the route; the caller sets the new state. */
function abandonCurrentTask(world: World, id: EntityId): void {
  const ant = world.getComponent<AntComponent>(id, COMPONENT.ANT);
  if (ant) ant.stateTimer = 0;
  clearCombatTarget(world, id);
  clearPath(world, id);
}

function clearCombatTarget(world: World, id: EntityId): void {
  const combat = world.getComponent<CombatComponent>(id, COMPONENT.COMBAT);
  if (combat) combat.targetEntityId = null;
}

function clearPath(world: World, id: EntityId): void {
  const path = world.getComponent<PathComponent>(id, COMPONENT.PATH);
  if (path) {
    path.waypoints = [];
    path.currentIndex = 0;
  }
}
