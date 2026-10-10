import type { System } from '../../../engine/ecs/types';
import type { World } from '../../../engine/ecs/World';
import type { EntityId, Vector2 } from '../../../shared/types';
import { findPath, type PathGrid } from '../../../simulation/pathfinding/AStar';
import {
  COMPONENT,
  Layer,
  OrderKind,
  type CombatComponent,
  type LayerComponent,
  type PathComponent,
  type PlayerOrderComponent,
  type PositionComponent,
  type RenderComponent,
  type RoleStatsComponent,
} from '../../components/components';
import { FactionId, ownerOf } from '../../factions/factions';
import { HUMAN_COMPONENT } from '../../rival/humanComponents';
import {
  completePlayerOrder,
  endPlayerOrder,
  findEnemyStructureNear,
  isSurfaceEnemy,
} from '../../systems/helpers/playerOrders';
import {
  GUARD_LEASH_RADIUS,
  ORDER_CHASE_REPATH_SECONDS,
  ORDER_MAX_ROUTES,
  ORDER_PATH_MAX_STEPS,
  ORDER_SETTLE_RADIUS,
  ORDER_TIMEOUT_SECONDS,
  SOLDIER_CHASE_RANGE,
} from '../../../shared/constants';

/** Enemy units a Crystal unit fights on its own (structures only when ordered or on arrival) */
const ENEMY_UNIT_STORES = [COMPONENT.BEETLE, COMPONENT.CRICKET, COMPONENT.CRYSTAL_UNIT, HUMAN_COMPONENT.UNIT] as const;
/** Routes the player's Crystal units may request per tick, all together */
const ROUTES_PER_TICK = 6;
/** A unit counts as arrived this close to its slot (hovering units glide, they do not snap) */
const ARRIVE_RADIUS = 0.5;
/** A unit on guard walks back once a fight left it this far from its post */
const GUARD_HOME = 1.5;

interface Seen {
  id: EntityId;
  x: number;
  y: number;
}

/**
 * Drives the player's own Crystal units (P10) through the same orders the
 * Swarm's warriors take (PlayerOrderComponent): move, attack one enemy,
 * attack-move, hold position, and the guard post a finished order leaves.
 * A unit with no order guards the spot it stands on, StarCraft style: it
 * fights what comes near and walks back. CrystalUnitAISystem skips these
 * units, so the rival's brain never overrides a player's order.
 */
export class CrystalPlayerUnitSystem implements System {
  readonly name = 'CrystalPlayerUnitSystem';
  readonly priority = 5.5; // after the colony AI (5), before the rival's units (6) and Combat (7)

  private world: World;
  private grid: PathGrid;
  private enemies: Seen[] = [];
  private routesLeft = 0;

  constructor(world: World, grid: PathGrid) {
    this.world = world;
    this.grid = grid;
  }

  update(dt: number): void {
    const units = this.world.query(COMPONENT.CRYSTAL_UNIT, COMPONENT.POSITION, COMPONENT.PATH)
      .filter((id) => ownerOf(this.world, id) === FactionId.PLAYER && this.onSurface(id));
    if (units.length === 0) return;
    this.snapshotEnemies();
    this.routesLeft = ROUTES_PER_TICK;
    for (const id of units) {
      let order = this.world.getComponent<PlayerOrderComponent>(id, COMPONENT.PLAYER_ORDER);
      if (!order) order = this.guardHere(id);
      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      const path = this.world.getComponent<PathComponent>(id, COMPONENT.PATH)!;
      switch (order.kind) {
        case OrderKind.Move:
          this.walk(id, pos, path, order, dt);
          break;
        case OrderKind.AttackMove:
          if (!this.fightOnTheWay(id, pos, path, order, dt)) this.walk(id, pos, path, order, dt);
          break;
        case OrderKind.Attack:
          this.attack(id, pos, path, order, dt);
          break;
        case OrderKind.Hold:
          this.hold(id, pos, path, order);
          break;
        case OrderKind.Guard:
          this.guard(id, pos, path, order, dt);
          break;
      }
    }
  }

  private onSurface(id: EntityId): boolean {
    const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER);
    return !layer || layer.layer === Layer.Surface;
  }

  private snapshotEnemies(): void {
    this.enemies.length = 0;
    for (const store of ENEMY_UNIT_STORES) {
      for (const id of this.world.query(store, COMPONENT.POSITION)) {
        if (!isSurfaceEnemy(this.world, id)) continue;
        const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
        this.enemies.push({ id, x: pos.x, y: pos.y });
      }
    }
  }

  /** No order: keep the spot it stands on */
  private guardHere(id: EntityId): PlayerOrderComponent {
    const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
    const order: PlayerOrderComponent = {
      kind: OrderKind.Guard,
      target: { x: pos.x, y: pos.y },
      targetId: null,
      repath: 0,
      layer: Layer.Surface,
      elapsed: 0,
      routes: 0,
    };
    this.world.addComponent<PlayerOrderComponent>(id, COMPONENT.PLAYER_ORDER, order);
    return order;
  }

  private visionOf(id: EntityId): number {
    return this.world.getComponent<RoleStatsComponent>(id, COMPONENT.ROLE_STATS)?.visionRange ?? 7;
  }

  private rangeOf(id: EntityId): number {
    return this.world.getComponent<CombatComponent>(id, COMPONENT.COMBAT)?.attackRange ?? 1.2;
  }

  /** The nearest enemy unit within `radius` of `around` (and within vision of the unit) */
  private nearestEnemy(pos: Vector2, vision: number, around: Vector2, radius: number): Seen | null {
    let best: Seen | null = null;
    let bestDist = Infinity;
    for (const enemy of this.enemies) {
      const dist = Math.hypot(enemy.x - pos.x, enemy.y - pos.y);
      if (dist > vision || Math.hypot(enemy.x - around.x, enemy.y - around.y) > radius) continue;
      if (dist < bestDist) {
        best = enemy;
        bestDist = dist;
      }
    }
    return best;
  }

  /** Where an enemy stands now; null once it is dead, gone below or no longer hostile */
  private enemyAt(id: EntityId): PositionComponent | null {
    if (!isSurfaceEnemy(this.world, id)) return null;
    return this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION) ?? null;
  }

  /** Reach to an enemy's edge: structures are hit anywhere on their body */
  private gapTo(pos: Vector2, enemyId: EntityId, enemy: Vector2): number {
    const structure = this.world.getComponent(enemyId, COMPONENT.CRYSTAL_UNIT) === undefined
      && !ENEMY_UNIT_STORES.some((store) => this.world.getComponent(enemyId, store) !== undefined);
    const size = structure ? this.world.getComponent<RenderComponent>(enemyId, COMPONENT.RENDER)?.radius ?? 0 : 0;
    return Math.max(0, Math.hypot(enemy.x - pos.x, enemy.y - pos.y) - size);
  }

  private walk(id: EntityId, pos: PositionComponent, path: PathComponent, order: PlayerOrderComponent, dt: number): void {
    order.elapsed += dt;
    const dist = Math.hypot(order.target.x - pos.x, order.target.y - pos.y);
    const routeDone = path.currentIndex >= path.waypoints.length;
    if (
      dist <= ARRIVE_RADIUS
      || order.elapsed > ORDER_TIMEOUT_SECONDS
      || (routeDone && order.routes > 0 && dist <= ORDER_SETTLE_RADIUS)
      || (routeDone && order.routes >= ORDER_MAX_ROUTES)
    ) {
      if (order.kind === OrderKind.AttackMove) this.finishAttackMove(id, pos, path, order);
      else completePlayerOrder(this.world, id);
      return;
    }
    if (routeDone) this.route(pos, path, order, order.target);
  }

  /** An attack-move arrived: a hostile base there is what it came for; otherwise it guards the spot */
  private finishAttackMove(id: EntityId, pos: PositionComponent, path: PathComponent, order: PlayerOrderComponent): void {
    const base = findEnemyStructureNear(this.world, pos, this.visionOf(id));
    if (base === null) {
      completePlayerOrder(this.world, id);
      return;
    }
    order.kind = OrderKind.Attack;
    order.elapsed = 0;
    order.routes = 0;
    this.engage(path, order, base);
  }

  private attack(id: EntityId, pos: PositionComponent, path: PathComponent, order: PlayerOrderComponent, dt: number): void {
    const enemy = order.targetId !== null ? this.enemyAt(order.targetId) : null;
    if (!enemy || order.targetId === null) {
      endPlayerOrder(this.world, id);
      return;
    }
    order.target = { x: enemy.x, y: enemy.y };
    if (this.gapTo(pos, order.targetId, enemy) > this.rangeOf(id)) {
      order.elapsed += dt;
      if (order.elapsed > ORDER_TIMEOUT_SECONDS) {
        endPlayerOrder(this.world, id);
        return;
      }
    }
    this.fightStep(id, pos, path, order, order.targetId, enemy, dt);
  }

  private fightOnTheWay(id: EntityId, pos: PositionComponent, path: PathComponent, order: PlayerOrderComponent, dt: number): boolean {
    let enemy = order.targetId !== null ? this.enemyAt(order.targetId) : null;
    if (enemy && Math.hypot(enemy.x - pos.x, enemy.y - pos.y) > SOLDIER_CHASE_RANGE) enemy = null;
    if (!enemy) {
      if (order.targetId !== null) {
        this.drop(id, path, order);
        order.routes = 0;
      }
      const vision = this.visionOf(id);
      const seen = this.nearestEnemy(pos, vision, pos, vision);
      if (!seen) return false;
      enemy = this.engage(path, order, seen.id);
      if (!enemy) return false;
    }
    this.fightStep(id, pos, path, order, order.targetId!, enemy, dt);
    return true;
  }

  private hold(id: EntityId, pos: PositionComponent, path: PathComponent, order: PlayerOrderComponent): void {
    path.waypoints = [];
    path.currentIndex = 0;
    const range = this.rangeOf(id);
    let enemy = order.targetId !== null ? this.enemyAt(order.targetId) : null;
    if (enemy && order.targetId !== null && this.gapTo(pos, order.targetId, enemy) > range) enemy = null;
    if (!enemy) {
      if (order.targetId !== null) this.drop(id, path, order);
      const inReach = this.nearestEnemy(pos, range, pos, range);
      if (inReach) enemy = this.engage(path, order, inReach.id);
    }
    const combat = this.world.getComponent<CombatComponent>(id, COMPONENT.COMBAT);
    if (combat) combat.targetEntityId = enemy ? order.targetId : null;
  }

  private guard(id: EntityId, pos: PositionComponent, path: PathComponent, order: PlayerOrderComponent, dt: number): void {
    const post = order.target;
    let enemy = order.targetId !== null ? this.enemyAt(order.targetId) : null;
    if (enemy && Math.hypot(enemy.x - post.x, enemy.y - post.y) > GUARD_LEASH_RADIUS) enemy = null;
    if (!enemy) {
      if (order.targetId !== null) this.drop(id, path, order);
      const seen = this.nearestEnemy(pos, this.visionOf(id), post, GUARD_LEASH_RADIUS);
      if (seen) enemy = this.engage(path, order, seen.id);
    }
    if (enemy && order.targetId !== null) {
      this.fightStep(id, pos, path, order, order.targetId, enemy, dt);
      return;
    }
    if (Math.hypot(post.x - pos.x, post.y - pos.y) > GUARD_HOME) {
      order.repath -= dt;
      if (path.currentIndex >= path.waypoints.length && order.repath <= 0 && this.route(pos, path, order, post)) {
        order.repath = ORDER_CHASE_REPATH_SECONDS;
      }
      return;
    }
    path.waypoints = [];
    path.currentIndex = 0;
  }

  /** Strike when in reach (CombatSystem lands it), else close in on a route refreshed as the quarry moves */
  private fightStep(
    id: EntityId,
    pos: PositionComponent,
    path: PathComponent,
    order: PlayerOrderComponent,
    enemyId: EntityId,
    enemy: Vector2,
    dt: number,
  ): void {
    const combat = this.world.getComponent<CombatComponent>(id, COMPONENT.COMBAT);
    if (combat) combat.targetEntityId = enemyId;
    if (this.gapTo(pos, enemyId, enemy) <= this.rangeOf(id) * 0.95) {
      path.waypoints = [];
      path.currentIndex = 0;
      order.repath = 0;
      return;
    }
    order.repath -= dt;
    const routeDone = path.currentIndex >= path.waypoints.length;
    if ((routeDone || order.repath <= 0) && this.route(pos, path, order, enemy)) order.repath = ORDER_CHASE_REPATH_SECONDS;
  }

  private engage(path: PathComponent, order: PlayerOrderComponent, enemyId: EntityId): PositionComponent | null {
    const enemy = this.enemyAt(enemyId);
    if (!enemy) return null;
    order.targetId = enemyId;
    order.repath = 0;
    path.waypoints = [];
    path.currentIndex = 0;
    return enemy;
  }

  private drop(id: EntityId, path: PathComponent, order: PlayerOrderComponent): void {
    order.targetId = null;
    order.repath = 0;
    const combat = this.world.getComponent<CombatComponent>(id, COMPONENT.COMBAT);
    if (combat) combat.targetEntityId = null;
    path.waypoints = [];
    path.currentIndex = 0;
  }

  /** Route toward `goal` if this tick's ration allows; returns whether a route was requested */
  private route(pos: PositionComponent, path: PathComponent, order: PlayerOrderComponent, goal: Vector2): boolean {
    if (this.routesLeft <= 0) return false;
    this.routesLeft--;
    order.routes++;
    const route = findPath(
      this.grid,
      { x: Math.round(pos.x), y: Math.round(pos.y) },
      { x: Math.round(goal.x), y: Math.round(goal.y) },
      ORDER_PATH_MAX_STEPS,
    );
    if (route && route.length > 0) {
      path.waypoints = route;
      const start = route[0];
      path.currentIndex = route.length > 1 && start.x === Math.round(pos.x) && start.y === Math.round(pos.y) ? 1 : 0;
      // The last waypoint is the exact goal, not its tile center
      if (order.kind !== OrderKind.Attack && order.targetId === null) path.waypoints[path.waypoints.length - 1] = { x: goal.x, y: goal.y };
      return true;
    }
    return true;
  }
}
