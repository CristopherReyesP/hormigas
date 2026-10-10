import type { System } from '../../../engine/ecs/types';
import type { World } from '../../../engine/ecs/World';
import type { EntityId, Vector2 } from '../../../shared/types';
import type { PathGrid } from '../../../simulation/pathfinding/AStar';
import {
  COMPONENT,
  OrderKind,
  type CombatComponent,
  type PathComponent,
  type PlayerOrderComponent,
  type PositionComponent,
  type RenderComponent,
} from '../../components/components';
import { FactionId, isHostileTo } from '../../factions/factions';
import { HUMAN_UNIT_STATS } from '../../rival/humanBase';
import { HUMAN_COMPONENT, type HumanUnitComponent } from '../../rival/humanComponents';
import { endPlayerOrder } from '../../systems/helpers/playerOrders';
import { clearPath, isPlayerOwned, onSurface, pathDone, positionOf, routeTo } from './humanPlayerQueries';

/** Seconds between two route requests while closing in on a moving enemy */
const CHASE_REPATH = 0.8;
/** Seconds before a stuck march asks for a new route */
const MARCH_REPATH = 1.5;
/** A move or attack-move counts as arrived this close to its slot */
const ARRIVED = 0.6;
/** ...or this close once its route has run out */
const ARRIVED_LOOSE = 1.6;
/** An idle unit walks back once it strays this far from its post */
const POST_SLACK = 1.5;
/** Shooters stop a little inside their range, so a step back by the target does not break the shot */
const RANGE_MARGIN = 0.9;
/** An attack-move that arrives next to an enemy base turns on it within this reach */
const BASE_REACH = 4;

/** Units an idle or attack-moving trooper picks a fight with */
const UNIT_STORES = [COMPONENT.ANT, COMPONENT.BEETLE, COMPONENT.CRICKET, COMPONENT.CRYSTAL_UNIT, HUMAN_COMPONENT.UNIT];
/** Bases: shot when ordered, when in range, or at the end of an attack-move */
const STRUCTURE_STORES = [COMPONENT.BEETLE_DEN, COMPONENT.CRICKET_DEN, COMPONENT.CRYSTAL_HIVE, COMPONENT.CRYSTAL_SPIRE, HUMAN_COMPONENT.BUILDING];

interface Foe {
  id: EntityId;
  x: number;
  y: number;
  structure: boolean;
  /** Body size: a base is hit anywhere on its footprint */
  size: number;
}

/**
 * Carries out the player's orders on their Human units, StarCraft style:
 * move (ignore enemies), attack one target, attack-move (fight what is met
 * on the way), hold position (shoot only what is in range) and the guard post
 * a trooper keeps afterwards. Without an order a trooper holds its spot and
 * shoots what comes into sight, chasing only a little. Builders without an
 * order belong to HumanPlayerSystem (mining and building). The rival's Human
 * troops are HumanUnitAISystem's and are never touched here.
 */
export class HumanPlayerUnitSystem implements System {
  readonly name = 'HumanPlayerUnitSystem';
  readonly priority = 5.5; // after AntAI (5), before the unit AIs (6) and Combat (7)

  private world: World;
  private grid: PathGrid;
  private foes: Foe[] = [];

  constructor(world: World, grid: PathGrid) {
    this.world = world;
    this.grid = grid;
  }

  update(dt: number): void {
    const units = this.world.query(HUMAN_COMPONENT.UNIT, COMPONENT.POSITION, COMPONENT.PATH)
      .filter((id) => isPlayerOwned(this.world, id) && onSurface(this.world, id));
    if (units.length === 0) return;
    this.snapshotFoes();
    for (const id of units) {
      const unit = this.world.getComponent<HumanUnitComponent>(id, HUMAN_COMPONENT.UNIT)!;
      const order = this.world.getComponent<PlayerOrderComponent>(id, COMPONENT.PLAYER_ORDER);
      if (unit.type === 'builder' && !order) continue;
      unit.repathTimer = Math.max(0, unit.repathTimer - dt);
      const pos = positionOf(this.world, id)!;
      const path = this.world.getComponent<PathComponent>(id, COMPONENT.PATH)!;
      const combat = this.world.getComponent<CombatComponent>(id, COMPONENT.COMBAT);
      if (!order) {
        this.idle(unit, pos, path, combat);
        continue;
      }
      order.elapsed += dt;
      order.repath = Math.max(0, order.repath - dt);
      unit.goal = null;
      switch (order.kind) {
        case OrderKind.Move:
          this.move(id, unit, order, pos, path, combat);
          break;
        case OrderKind.AttackMove:
          if (!combat) this.move(id, unit, order, pos, path, combat);
          else this.attackMove(id, unit, order, pos, path, combat);
          break;
        case OrderKind.Attack:
          this.attack(id, unit, order, pos, path, combat);
          break;
        case OrderKind.Hold:
          this.hold(pos, path, combat);
          break;
        case OrderKind.Guard:
          this.guard(unit, order.target, pos, path, combat, HUMAN_UNIT_STATS[unit.type].leashRange);
          break;
      }
    }
  }

  /** Every hostile thing on the surface the player's troops may shoot (wildlife included) */
  private snapshotFoes(): void {
    this.foes.length = 0;
    const add = (stores: readonly string[], structure: boolean) => {
      for (const store of stores) {
        for (const id of this.world.query(store, COMPONENT.POSITION)) {
          if (!onSurface(this.world, id) || !isHostileTo(this.world, FactionId.PLAYER, id)) continue;
          const p = positionOf(this.world, id)!;
          const size = structure ? this.world.getComponent<RenderComponent>(id, COMPONENT.RENDER)?.radius ?? 1 : 0;
          this.foes.push({ id, x: p.x, y: p.y, structure, size });
        }
      }
    };
    add(UNIT_STORES, false);
    add(STRUCTURE_STORES, true);
  }

  private foe(id: EntityId | null): Foe | null {
    if (id === null) return null;
    return this.foes.find((f) => f.id === id) ?? null;
  }

  /**
   * The enemy to shoot from `pos`: the current one while it stays within
   * `keep`, else the nearest unit within `sight`, else a base within weapon
   * range. Null when there is none.
   */
  private acquire(pos: Vector2, current: EntityId | null, sight: number, keep: number, range: number): Foe | null {
    const held = this.foe(current);
    if (held && Math.hypot(held.x - pos.x, held.y - pos.y) - held.size <= keep) return held;
    let best: Foe | null = null;
    let bestDist = Infinity;
    for (const foe of this.foes) {
      const d = Math.hypot(foe.x - pos.x, foe.y - pos.y);
      const limit = foe.structure ? range : sight;
      if (d > limit) continue;
      // Units come first: a base is only the target when no unit is in sight
      const score = foe.structure ? d + 1000 : d;
      if (score < bestDist || (score === bestDist && best !== null && foe.id < best.id)) {
        best = foe;
        bestDist = score;
      }
    }
    return best;
  }

  /** Close in until the enemy is in weapon range, then stand and shoot (CombatSystem lands the shot) */
  private engage(unit: HumanUnitComponent, pos: PositionComponent, path: PathComponent, combat: CombatComponent, foe: Foe): void {
    combat.targetEntityId = foe.id;
    const dist = Math.hypot(foe.x - pos.x, foe.y - pos.y);
    if (dist <= combat.attackRange * RANGE_MARGIN) {
      clearPath(path);
      return;
    }
    if (unit.repathTimer > 0 && !pathDone(path)) return;
    unit.repathTimer = CHASE_REPATH;
    routeTo(this.grid, pos, path, foe);
  }

  /** Walk the route to `goal`, asking for a new one when it runs out early */
  private walkTo(order: PlayerOrderComponent, pos: PositionComponent, path: PathComponent, goal: Vector2): void {
    if (!pathDone(path) || order.repath > 0) return;
    order.repath = MARCH_REPATH;
    order.routes++;
    routeTo(this.grid, pos, path, goal);
  }

  private arrived(order: PlayerOrderComponent, pos: PositionComponent, path: PathComponent): boolean {
    const d = Math.hypot(order.target.x - pos.x, order.target.y - pos.y);
    return d <= ARRIVED || (pathDone(path) && d <= ARRIVED_LOOSE) || (pathDone(path) && order.routes >= 4);
  }

  private move(
    id: EntityId,
    unit: HumanUnitComponent,
    order: PlayerOrderComponent,
    pos: PositionComponent,
    path: PathComponent,
    combat: CombatComponent | undefined,
  ): void {
    if (combat) combat.targetEntityId = null;
    if (this.arrived(order, pos, path)) {
      this.complete(id, unit, order, pos, path);
      return;
    }
    this.walkTo(order, pos, path, order.target);
  }

  private attackMove(
    id: EntityId,
    unit: HumanUnitComponent,
    order: PlayerOrderComponent,
    pos: PositionComponent,
    path: PathComponent,
    combat: CombatComponent,
  ): void {
    const stats = HUMAN_UNIT_STATS[unit.type];
    const foe = this.acquire(pos, combat.targetEntityId, stats.visionRange, stats.leashRange, combat.attackRange);
    if (foe) {
      order.targetId = foe.id;
      this.engage(unit, pos, path, combat, foe);
      return;
    }
    if (order.targetId !== null) {
      // The fight is over: back on the march
      order.targetId = null;
      order.repath = 0;
      clearPath(path);
    }
    combat.targetEntityId = null;
    if (!this.arrived(order, pos, path)) {
      this.walkTo(order, pos, path, order.target);
      return;
    }
    // Arrived next to an enemy base: turn on it
    const base = this.foes.find((f) => f.structure && Math.hypot(f.x - pos.x, f.y - pos.y) - f.size <= BASE_REACH);
    if (base) {
      order.kind = OrderKind.Attack;
      order.targetId = base.id;
      order.target = { x: base.x, y: base.y };
      return;
    }
    this.complete(id, unit, order, pos, path);
  }

  private attack(
    id: EntityId,
    unit: HumanUnitComponent,
    order: PlayerOrderComponent,
    pos: PositionComponent,
    path: PathComponent,
    combat: CombatComponent | undefined,
  ): void {
    const foe = this.foe(order.targetId);
    if (!combat || !foe) {
      // The target is dead or out of reach of any order: keep this spot
      if (combat) combat.targetEntityId = null;
      this.complete(id, unit, order, pos, path);
      return;
    }
    order.target = { x: foe.x, y: foe.y };
    this.engage(unit, pos, path, combat, foe);
  }

  private hold(pos: PositionComponent, path: PathComponent, combat: CombatComponent | undefined): void {
    clearPath(path);
    if (!combat) return;
    const foe = this.acquire(pos, combat.targetEntityId, combat.attackRange, combat.attackRange, combat.attackRange);
    combat.targetEntityId = foe?.id ?? null;
  }

  /** Keep `post`: shoot what comes into sight, chase it up to `leash` from the post, then walk back */
  private guard(
    unit: HumanUnitComponent,
    post: Vector2,
    pos: PositionComponent,
    path: PathComponent,
    combat: CombatComponent | undefined,
    leash: number,
  ): void {
    if (combat) {
      const stats = HUMAN_UNIT_STATS[unit.type];
      const foe = this.acquire(pos, combat.targetEntityId, stats.visionRange, stats.leashRange, combat.attackRange);
      if (foe && Math.hypot(foe.x - post.x, foe.y - post.y) <= leash + combat.attackRange) {
        this.engage(unit, pos, path, combat, foe);
        return;
      }
      combat.targetEntityId = null;
    }
    if (Math.hypot(post.x - pos.x, post.y - pos.y) <= POST_SLACK) {
      if (!pathDone(path)) {
        const end = path.waypoints[path.waypoints.length - 1];
        if (Math.hypot(end.x - post.x, end.y - post.y) > POST_SLACK) clearPath(path);
      }
      return;
    }
    if (!pathDone(path) || unit.repathTimer > 0) return;
    unit.repathTimer = MARCH_REPATH;
    routeTo(this.grid, pos, path, post);
  }

  /** No order: the spot it stands on is its post, with a short leash */
  private idle(unit: HumanUnitComponent, pos: PositionComponent, path: PathComponent, combat: CombatComponent | undefined): void {
    if (!unit.goal) unit.goal = { x: pos.x, y: pos.y };
    unit.state = 'guarding';
    this.guard(unit, unit.goal, pos, path, combat, HUMAN_UNIT_STATS[unit.type].attackRange + 2);
  }

  /** The order is done: a trooper keeps the spot as its guard post; a builder goes back to standing by */
  private complete(id: EntityId, unit: HumanUnitComponent, order: PlayerOrderComponent, pos: PositionComponent, path: PathComponent): void {
    clearPath(path);
    if (unit.type === 'builder') {
      endPlayerOrder(this.world, id);
      unit.goal = { x: pos.x, y: pos.y };
      return;
    }
    order.kind = OrderKind.Guard;
    order.target = { x: pos.x, y: pos.y };
    order.targetId = null;
    order.elapsed = 0;
    order.routes = 0;
    order.repath = 0;
  }
}
