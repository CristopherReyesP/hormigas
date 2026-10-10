import type { System } from '../../engine/ecs/types';
import { HUMAN_COMPONENT } from '../rival/humanComponents';
import type { World } from '../../engine/ecs/World';
import type { TileGrid } from '../../simulation/world/TileGrid';
import type { GlobalModifiers } from '../events/GlobalModifiers';
import type { EntityId, Vector2 } from '../../shared/types';
import {
  COMPONENT,
  AntState,
  AntRole,
  ColonyPriority,
  FoodType,
  Layer,
  OrderKind,
  ORE_LOAD,
  isOreLoad,
  type AntComponent,
  type PositionComponent,
  type CarryingComponent,
  type PathComponent,
  type FoodSourceComponent,
  type MineralComponent,
  type RoleStatsComponent,
  type CombatComponent,
  type HealthComponent,
  type HungerComponent,
  type LayerComponent,
  type NestComponent,
  type PlayerOrderComponent,
} from '../components/components';
import type { VisibilityGrid } from '../../simulation/world/VisibilityGrid';
import { findPath } from '../../simulation/pathfinding/AStar';
import { buildAttackerMap, ensureCombatComponent } from './helpers/combatHelpers';
import { canFight, completePlayerOrder, endPlayerOrder, findEnemyStructureNear, isSurfaceEnemy } from './helpers/playerOrders';
import { FactionId, isHostileTo } from '../factions/factions';
import type { PantryFoodType, UndergroundGrid } from '../../simulation/world/UndergroundGrid';
import type { TransitSystem } from './TransitSystem';
import {
  ANT_HARVEST_RANGE,
  ANT_DEPOSIT_RANGE,
  PHEROMONE_MAX,
  MUSHROOM_NUTRITION_MULTIPLIER,
  MUSHROOM_PREFERENCE_MULTIPLIER,
  SOLDIER_ATTACK_RANGE,
  SOLDIER_PATROL_RADIUS,
  SOLDIER_CHASE_RANGE,
  DANGER_PHEROMONE_EMIT_STRENGTH,
  DANGER_PHEROMONE_TRAIL_STRENGTH,
  SCOUT_FLEE_DISTANCE,
  BEETLE_MEAT_NUTRITION_MULTIPLIER,
  CRICKET_MEAT_NUTRITION_MULTIPLIER,
  SCOUT_FLEE_HEALTH_RATIO,
  SCOUT_BEETLE_DETECT_RANGE,
  WORKER_FIGHT_RANGE,
  SOLDIER_DANGER_CHASE_THRESHOLD,
  HUNGER_EAT_THRESHOLD,
  GIANT_MUSHROOM_NUTRITION_MULTIPLIER,
  ROLE_BASE_WEIGHTS,
  COLONY_PRIORITY_MULTIPLIERS,
  TILE_SCORE,
  ACTION_SCORE,
  RETURNING_HOME_DROP_TIMEOUT,
  STUCK_STALL_SECONDS,
  STUCK_MIN_DISPLACEMENT,
  SOLDIER_FOCUS_FIRE_BONUS,
  SOLDIER_MAX_FOCUS_ALLIES,
  NEST_THREAT_RADIUS,
  NEST_ALARM_SCORE,
  FORAGE_ENEMY_AVOID_RADIUS,
  ORDER_PATHS_PER_TICK,
  ORDER_PATH_MAX_STEPS,
  ORDER_ARRIVE_RADIUS,
  ORDER_SETTLE_RADIUS,
  ORDER_MAX_ROUTES,
  ORDER_TIMEOUT_SECONDS,
  ORDER_CHASE_REPATH_SECONDS,
  GUARD_LEASH_RADIUS,
  GUARD_HOME_RADIUS,
  MINERAL_TRIP_AMOUNT,
  MINERAL_MINE_SECONDS,
  MINER_ALLOCATE_SECONDS,
  MINER_FIELD_REACH,
  SURFACE_GLUT_PILE,
} from '../../shared/constants';
import { autoMinerTarget, clampMinerTarget, type MinerStatus } from '../economy/minerAllocation';
import { clearResourceOrder } from './helpers/resourceOrders';

/** A miner that has not reached its node in this long gives up and looks for other work */
const MINING_GIVE_UP_SECONDS = 40;

interface ActionCandidate {
  action: 'chase' | 'gather' | 'mine' | 'explore' | 'patrol';
  score: number;
  targetId?: EntityId;
}

interface TileCandidate {
  x: number;
  y: number;
  score: number;
}

export class AntAISystem implements System {
  readonly name = 'AntAISystem';
  readonly priority = 5; // run before movement

  private nestEntityId: EntityId | null = null;
  private world: World;
  private grid: TileGrid;
  private visibilityGrid: VisibilityGrid;
  private modifiers: GlobalModifiers;
  private undergroundGrid: UndergroundGrid | null = null;
  private transitSystem: TransitSystem | null = null;
  public colonyPriority: ColonyPriority = ColonyPriority.Gather;

  // Per-tick snapshots — rebuilt once in update() and shared by every ant.
  // Replaces per-ant world.query scans (the former findAttacker/findNearestBeetle
  // pattern cost ~4 full queries PER ANT per frame; with 400 ants the game choked).
  private attackerByTarget: Map<EntityId, EntityId> = new Map();
  private enemySnapshot: Array<{ id: EntityId; x: number; y: number }> = [];
  private foodSnapshot: Array<{ id: EntityId; x: number; y: number; type?: FoodType }> = [];
  /** Surface mineral nodes that still hold ore */
  private mineralSnapshot: Array<{ id: EntityId; x: number; y: number }> = [];
  /**
   * Miners, rebuilt every tick: surface workers the colony sent to a node on
   * its own (they count toward the miner target), workers on a Minar order,
   * and how many of either work each node (allocation spreads them out).
   */
  private autonomousMiners = 0;
  private orderedMiners = 0;
  private workerCount = 0;
  private minersByNode: Map<EntityId, number> = new Map();
  /** Where each mineral node stood: an ordered miner whose node ran out looks for the next one around there */
  private nodePositions: Map<EntityId, Vector2> = new Map();
  /** Autonomous miners the player asked for (Mineras: N); null follows the workforce */
  private minerTarget: number | null = null;
  private allocateTimer = 0;
  /** enemy id -> how many ants are already biting it (focus fire + flanking synergy) */
  private antsEngaging: Map<EntityId, number> = new Map();
  /** Recomputed once per tick — the hunger checks consult it per ant */
  private undergroundFoodAvailable = false;
  /** Pantry full with a pile waiting at the entrance (recomputed each tick) */
  private surfaceGlut = false;
  /** A* runs left this tick for ordered ants: a 40-ant order routes over a few frames, not in one */
  private orderRoutesLeft = 0;

  constructor(world: World, grid: TileGrid, visibilityGrid: VisibilityGrid, modifiers: GlobalModifiers) {
    this.world = world;
    this.grid = grid;
    this.visibilityGrid = visibilityGrid;
    this.modifiers = modifiers;
  }

  /** Wired after construction (TransitSystem is created later in GameManager.init) */
  setUndergroundAccess(grid: UndergroundGrid, transit: TransitSystem): void {
    this.undergroundGrid = grid;
    this.transitSystem = transit;
  }

  private hasNest(): boolean {
    return this.nestEntityId !== null;
  }

  update(dt: number): void {
    // Cache nest position
    if (this.nestEntityId === null) {
      const nests = this.world.query(COMPONENT.NEST, COMPONENT.POSITION);
      if (nests.length > 0) this.nestEntityId = nests[0];
    }

    this.buildTickSnapshots();
    this.orderRoutesLeft = ORDER_PATHS_PER_TICK;
    this.allocateTimer -= dt;
    if (this.allocateTimer <= 0) {
      this.allocateTimer = MINER_ALLOCATE_SECONDS;
      this.allocateMiners();
    }

    const ants = this.world.query(COMPONENT.ANT, COMPONENT.POSITION, COMPONENT.PATH, COMPONENT.CARRYING);

    for (const id of ants) {
      const order = this.world.getComponent<PlayerOrderComponent>(id, COMPONENT.PLAYER_ORDER);

      // A Recolectar order ends the moment its source is gone, wherever the ant is
      const gatherer = this.world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
      if (gatherer.resourceOrder === 'gather' && (gatherer.foodTargetId == null || !this.world.hasEntity(gatherer.foodTargetId))) {
        clearResourceOrder(this.world, id);
      }

      // Skip underground entities — handled by NurseAISystem / ExcavationSystem
      const layerComp = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER);
      if (layerComp && layerComp.layer === Layer.Underground) {
        // Orders run on the surface only (for now): one that followed an ant below is void
        if (order) endPlayerOrder(this.world, id);
        continue;
      }

      const ant = this.world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      const path = this.world.getComponent<PathComponent>(id, COMPONENT.PATH)!;
      const carrying = this.world.getComponent<CarryingComponent>(id, COMPONENT.CARRYING)!;

      ant.stateTimer += dt;

      // A player order outranks the colony AI and every safety net below. A
      // worker's order ends on arrival and this loop picks its job back up; a
      // warrior's turns into a guard post it keeps.
      if (order) {
        if (order.layer === Layer.Surface && !this.transitSystem?.isInTransit(id)) {
          this.followPlayerOrder(id, ant, pos, path, order, dt);
          continue;
        }
        endPlayerOrder(this.world, id);
      }

      // Bug 3: position-stall detection — catches stale non-empty paths.
      // Lazy-init last-known position; accumulate stuckTimer when displacement
      // is below threshold; reset and update when the ant actually moves.
      ant.lastX ??= pos.x;
      ant.lastY ??= pos.y;
      ant.stuckTimer ??= 0;
      const displacement = Math.hypot(pos.x - ant.lastX, pos.y - ant.lastY);
      if (displacement < STUCK_MIN_DISPLACEMENT) {
        ant.stuckTimer += dt;
      } else {
        ant.stuckTimer = 0;
        ant.lastX = pos.x;
        ant.lastY = pos.y;
      }
      if (ant.stuckTimer > STUCK_STALL_SECONDS) {
        const isStallMovementState =
          ant.state === AntState.GoingToFood ||
          ant.state === AntState.ChasingEnemy ||
          ant.state === AntState.Fleeing ||
          ant.state === AntState.PatrollingNest;
        if (isStallMovementState) {
          ant.state = AntState.ReturningHome;
          ant.stateTimer = 0;
          ant.stuckTimer = 0;
          this.pathToNest(pos, path);
          continue;
        }
      }

      // Stuck safety net: if ant can't progress for too long, retreat to nest
      if (ant.stateTimer > 8 && path.waypoints.length === 0) {
        const isMovementState =
          ant.state === AntState.GoingToFood ||
          ant.state === AntState.ChasingEnemy ||
          ant.state === AntState.Fleeing ||
          ant.state === AntState.PatrollingNest;
        if (isMovementState) {
          ant.state = AntState.ReturningHome;
          ant.stateTimer = 0;
          this.pathToNest(pos, path);
          continue;
        }
      }

      // Deposit food pheromone while returning
      if (ant.state === AntState.ReturningHome) {
        this.depositPheromone(pos, 'food', 100);
      }
      // Deposit home pheromone when near nest (ALL states — creates a beacon)
      const nestDistPhero = this.distToNest(pos);
      if (nestDistPhero < 15) {
        this.depositPheromone(pos, 'home', Math.max(10, 80 - nestDistPhero * 4));
      }
      // Emit danger pheromone while fleeing
      if (ant.state === AntState.Fleeing) {
        this.emitDangerPheromone(pos, DANGER_PHEROMONE_TRAIL_STRENGTH);
      }

      // A loaded surface ant's job is DELIVERY, not foraging — funnel it home
      // (covers post-combat survivors and any loaded ant back on the surface)
      if (
        carrying.amount > 0 &&
        (ant.state === AntState.Idle || ant.state === AntState.Searching)
      ) {
        ant.state = AntState.ReturningHome;
        ant.stateTimer = 0;
      }

      // Minar / Recolectar: a free worker on a resource order goes back to its source
      if (
        ant.resourceOrder !== undefined &&
        carrying.amount === 0 &&
        (ant.state === AntState.Idle || ant.state === AntState.Searching) &&
        !this.attackerByTarget.has(id) &&
        !(this.undergroundFoodAvailable && this.isHungry(id)) &&
        this.resumeResourceOrder(id, ant, pos, path)
      ) {
        continue;
      }

      switch (ant.state) {
        case AntState.Idle:
          ant.state = AntState.Searching;
          ant.stateTimer = 0;
          break;

        case AntState.Searching:
          this.handleSearching(id, ant, pos, path, dt);
          break;

        case AntState.GoingToFood:
          this.handleGoingToFood(id, ant, pos, path, carrying);
          break;

        case AntState.ReturningHome:
          this.handleReturningHome(id, ant, pos, path, carrying);
          break;

        case AntState.Mining:
          this.handleMining(id, ant, pos, path, carrying, dt);
          break;

        case AntState.Fleeing:
          this.handleFleeing(id, ant, pos, path);
          break;

        case AntState.ChasingEnemy:
          this.handleChasingEnemy(id, ant, pos, path);
          break;

        case AntState.AttackingEnemy:
          this.handleAttackingEnemy(id, ant, pos, path);
          break;

        case AntState.PatrollingNest:
          this.handlePatrollingNest(id, ant, pos, path);
          break;

        case AntState.Healing:
          // Riding the shaft down to eat — UndergroundHealingSystem feeds it
          // below. One still up here without a ride must not stand at the
          // entrance: back to work.
          if (!this.transitSystem?.isInTransit(id)) {
            ant.state = AntState.Searching;
            ant.stateTimer = 0;
          }
          break;
      }
    }
  }

  /**
   * Carry out a player order. Every order route is rationed per tick
   * (orderRoutesLeft), so a big group starts over a few frames instead of
   * running 40 A* searches at once.
   */
  private followPlayerOrder(
    id: EntityId,
    ant: AntComponent,
    pos: PositionComponent,
    path: PathComponent,
    order: PlayerOrderComponent,
    dt: number
  ): void {
    // Stall detection restarts from here, so the nets cannot fire the moment the order ends
    ant.stuckTimer = 0;
    ant.lastX = pos.x;
    ant.lastY = pos.y;

    switch (order.kind) {
      case OrderKind.Move:
        this.walkToSlot(id, ant, pos, path, order, dt);
        break;
      case OrderKind.AttackMove:
        if (!this.fightOnTheWay(id, ant, pos, path, order, dt)) this.walkToSlot(id, ant, pos, path, order, dt);
        break;
      case OrderKind.Attack:
        this.attackTarget(id, ant, pos, path, order, dt);
        break;
      case OrderKind.Hold:
        this.holdPosition(id, ant, pos, path, order);
        break;
      case OrderKind.Guard:
        this.guardPost(id, ant, pos, path, order, dt);
        break;
    }
  }

  /**
   * Walk to the formation slot. The order is done on arrival, when a finished
   * route left the ant close enough (slot crowded or blocked), or when the slot
   * proves unreachable; the timeout is the last resort.
   */
  private walkToSlot(
    id: EntityId,
    ant: AntComponent,
    pos: PositionComponent,
    path: PathComponent,
    order: PlayerOrderComponent,
    dt: number
  ): void {
    order.elapsed += dt;
    ant.state = AntState.Moving;

    const dist = Math.hypot(order.target.x - pos.x, order.target.y - pos.y);
    const routeDone = path.currentIndex >= path.waypoints.length;
    if (
      dist <= ORDER_ARRIVE_RADIUS ||
      order.elapsed > ORDER_TIMEOUT_SECONDS ||
      (routeDone && order.routes > 0 && dist <= ORDER_SETTLE_RADIUS) ||
      (routeDone && order.routes >= ORDER_MAX_ROUTES)
    ) {
      if (order.kind === OrderKind.AttackMove) this.finishAttackMove(id, ant, path, order, pos);
      else completePlayerOrder(this.world, id);
      return;
    }
    if (routeDone) this.routeOrder(pos, path, order, order.target);
  }

  /**
   * An attack-move arrived with nothing alive in view. A base standing there
   * (a den or the hive) is what it came for: the order turns into an attack
   * on it. Otherwise the attack is done and the colony AI takes the soldier
   * back, so it goes to defend the nest when the nest needs it.
   */
  private finishAttackMove(
    id: EntityId,
    ant: AntComponent,
    path: PathComponent,
    order: PlayerOrderComponent,
    pos: PositionComponent
  ): void {
    const base = canFight(this.world, id) ? findEnemyStructureNear(this.world, pos, this.visionOf(id)) : null;
    if (base === null) {
      endPlayerOrder(this.world, id);
      return;
    }
    order.kind = OrderKind.Attack;
    order.elapsed = 0;
    order.routes = 0;
    this.engageOrderTarget(path, order, base);
    ant.state = AntState.ChasingEnemy;
  }

  /**
   * Chase the ordered enemy and fight it until it dies; then the order is
   * done. Only time spent closing in counts toward the timeout, so a long
   * fight never drops it.
   */
  private attackTarget(
    id: EntityId,
    ant: AntComponent,
    pos: PositionComponent,
    path: PathComponent,
    order: PlayerOrderComponent,
    dt: number
  ): void {
    // Target dead (or out of reach for too long): the attack is done. No
    // guard post out there: the colony AI takes the soldier back, so it goes
    // to defend the nest when the nest needs it.
    const enemy = order.targetId !== null ? this.enemyPosition(order.targetId) : null;
    if (!enemy || order.targetId === null) {
      endPlayerOrder(this.world, id);
      return;
    }
    order.target = { x: enemy.x, y: enemy.y };
    if (Math.hypot(enemy.x - pos.x, enemy.y - pos.y) >= SOLDIER_ATTACK_RANGE) {
      order.elapsed += dt;
      if (order.elapsed > ORDER_TIMEOUT_SECONDS) {
        endPlayerOrder(this.world, id);
        return;
      }
    }
    this.fightStep(id, ant, pos, path, order, order.targetId, enemy, dt);
  }

  /**
   * Attack-move: engage whatever comes into view on the way (the same target
   * policy free soldiers use), chase it while it stays in chase range, then
   * pick the route back up. True while a fight holds the ant.
   */
  private fightOnTheWay(
    id: EntityId,
    ant: AntComponent,
    pos: PositionComponent,
    path: PathComponent,
    order: PlayerOrderComponent,
    dt: number
  ): boolean {
    if (!canFight(this.world, id)) return false;
    let enemy = order.targetId !== null ? this.enemyPosition(order.targetId) : null;
    if (enemy && Math.hypot(enemy.x - pos.x, enemy.y - pos.y) > SOLDIER_CHASE_RANGE) enemy = null;
    if (!enemy) {
      if (order.targetId !== null) {
        // The fight is over: back to the walk, on a fresh route to the slot
        this.dropOrderTarget(id, path, order);
        order.routes = 0;
      }
      const vision = this.visionOf(id);
      const seen = this.selectSoldierTarget(pos, vision, { x: pos.x, y: pos.y, radius: vision });
      if (!seen) return false;
      enemy = this.engageOrderTarget(path, order, seen.entityId);
      if (!enemy) return false;
    }
    this.fightStep(id, ant, pos, path, order, order.targetId!, enemy, dt);
    return true;
  }

  /** Mantener posición: never a step; bite what stands in reach, let go of what backs off. */
  private holdPosition(
    id: EntityId,
    ant: AntComponent,
    pos: PositionComponent,
    path: PathComponent,
    order: PlayerOrderComponent
  ): void {
    path.waypoints = [];
    path.currentIndex = 0;
    let enemy = order.targetId !== null ? this.enemyPosition(order.targetId) : null;
    if (enemy && Math.hypot(enemy.x - pos.x, enemy.y - pos.y) >= SOLDIER_ATTACK_RANGE) enemy = null;
    if (!enemy && canFight(this.world, id)) {
      const inReach = this.selectSoldierTarget(pos, SOLDIER_ATTACK_RANGE, { x: pos.x, y: pos.y, radius: SOLDIER_ATTACK_RANGE });
      if (inReach) enemy = this.engageOrderTarget(path, order, inReach.entityId);
    }
    if (!enemy || order.targetId === null) {
      if (order.targetId !== null) this.dropOrderTarget(id, path, order);
      if (this.releasedByHunger(id)) return;
      ant.state = AntState.Holding;
      return;
    }
    ensureCombatComponent(this.world, id, order.targetId);
    ant.state = AntState.AttackingEnemy;
  }

  /**
   * A warrior's post after an order: fight enemies that come within
   * GUARD_LEASH_RADIUS of it, never farther, then walk back. It never wanders
   * off to forage or patrol; only hunger, the horn or the player release it.
   */
  private guardPost(
    id: EntityId,
    ant: AntComponent,
    pos: PositionComponent,
    path: PathComponent,
    order: PlayerOrderComponent,
    dt: number
  ): void {
    const post = order.target;
    let enemy = order.targetId !== null ? this.enemyPosition(order.targetId) : null;
    if (enemy && Math.hypot(enemy.x - post.x, enemy.y - post.y) > GUARD_LEASH_RADIUS) enemy = null;
    if (!enemy && canFight(this.world, id)) {
      if (order.targetId !== null) this.dropOrderTarget(id, path, order);
      const seen = this.selectSoldierTarget(pos, this.visionOf(id), { x: post.x, y: post.y, radius: GUARD_LEASH_RADIUS });
      if (seen) enemy = this.engageOrderTarget(path, order, seen.entityId);
    }
    if (enemy && order.targetId !== null) {
      this.fightStep(id, ant, pos, path, order, order.targetId, enemy, dt);
      return;
    }
    if (order.targetId !== null) this.dropOrderTarget(id, path, order);

    if (Math.hypot(post.x - pos.x, post.y - pos.y) > GUARD_HOME_RADIUS) {
      ant.state = AntState.Moving;
      order.repath -= dt;
      if (path.currentIndex >= path.waypoints.length && order.repath <= 0 && this.routeOrder(pos, path, order, post)) {
        order.repath = ORDER_CHASE_REPATH_SECONDS;
      }
      return;
    }
    path.waypoints = [];
    path.currentIndex = 0;
    if (this.releasedByHunger(id)) return;
    ant.state = AntState.Guarding;
  }

  /**
   * One step of an ordered fight: bite when in reach, otherwise close in on a
   * route refreshed every ORDER_CHASE_REPATH_SECONDS (the quarry moves). The
   * claim on the enemy is set right away, so sisters see it for focus fire.
   */
  private fightStep(
    id: EntityId,
    ant: AntComponent,
    pos: PositionComponent,
    path: PathComponent,
    order: PlayerOrderComponent,
    enemyId: EntityId,
    enemy: { x: number; y: number },
    dt: number
  ): void {
    ensureCombatComponent(this.world, id, enemyId);
    if (Math.hypot(enemy.x - pos.x, enemy.y - pos.y) < SOLDIER_ATTACK_RANGE) {
      ant.state = AntState.AttackingEnemy;
      path.waypoints = [];
      path.currentIndex = 0;
      order.repath = 0;
      return;
    }
    ant.state = AntState.ChasingEnemy;
    order.repath -= dt;
    const routeDone = path.currentIndex >= path.waypoints.length;
    if ((routeDone || order.repath <= 0) && this.routeOrder(pos, path, order, enemy)) {
      order.repath = ORDER_CHASE_REPATH_SECONDS;
    }
  }

  /** Take `enemyId` as the order's current fight; returns where it stands, or null if it is no enemy. */
  private engageOrderTarget(path: PathComponent, order: PlayerOrderComponent, enemyId: EntityId): PositionComponent | null {
    const enemy = this.enemyPosition(enemyId);
    if (!enemy) return null;
    order.targetId = enemyId;
    order.repath = 0;
    path.waypoints = [];
    path.currentIndex = 0;
    return enemy;
  }

  /** The order's fight is over: forget the enemy, the claim on it and the chase route. */
  private dropOrderTarget(id: EntityId, path: PathComponent, order: PlayerOrderComponent): void {
    order.targetId = null;
    order.repath = 0;
    const combat = this.world.getComponent<CombatComponent>(id, COMPONENT.COMBAT);
    if (combat) combat.targetEntityId = null;
    path.waypoints = [];
    path.currentIndex = 0;
  }

  /** A post is no reason to starve: a hungry ant leaves it to go eat, when there is food below. */
  private releasedByHunger(id: EntityId): boolean {
    if (!this.undergroundFoodAvailable || !this.isHungry(id)) return false;
    endPlayerOrder(this.world, id);
    return true;
  }

  /** Where a surface enemy stands now; null once it is dead or gone below. */
  private enemyPosition(enemyId: EntityId): PositionComponent | null {
    if (!isSurfaceEnemy(this.world, enemyId)) return null;
    return this.world.getComponent<PositionComponent>(enemyId, COMPONENT.POSITION) ?? null;
  }

  private visionOf(id: EntityId): number {
    return this.world.getComponent<RoleStatsComponent>(id, COMPONENT.ROLE_STATS)?.visionRange ?? 8;
  }

  /**
   * Route an ordered ant toward `goal` if this tick's ration allows. With no
   * A* route (yet) it edges toward the goal and tries again when that step
   * ends. Returns whether a route was requested.
   */
  private routeOrder(pos: PositionComponent, path: PathComponent, order: PlayerOrderComponent, goal: { x: number; y: number }): boolean {
    if (this.orderRoutesLeft <= 0) return false;
    this.orderRoutesLeft--;
    order.routes++;
    const route = findPath(
      this.grid,
      { x: Math.round(pos.x), y: Math.round(pos.y) },
      { x: Math.round(goal.x), y: Math.round(goal.y) },
      ORDER_PATH_MAX_STEPS
    );
    if (route && route.length > 0) {
      path.waypoints = route;
      // A* starts on the ant's own tile. Walking back to its center first
      // undid the progress of every re-plan (a chase re-plans each
      // ORDER_CHASE_REPATH_SECONDS), so a soldier sent far away shuffled in
      // place by the nest until the order timed out: head for the next tile.
      const start = route[0];
      path.currentIndex = route.length > 1 && start.x === Math.round(pos.x) && start.y === Math.round(pos.y) ? 1 : 0;
      return true;
    }
    const step = this.fallbackMoveToward(pos, goal);
    if (step) {
      path.waypoints = [step];
      path.currentIndex = 0;
    }
    return true;
  }

  /** One pass over predators and surface food — every ant reads these arrays instead of re-querying */
  private buildTickSnapshots(): void {
    this.attackerByTarget = buildAttackerMap(this.world);
    this.undergroundFoodAvailable = this.computeUndergroundFood();
    this.surfaceGlut = this.computeSurfaceGlut();

    // SURFACE predators only. Invasion beetles live underground on the SAME
    // coordinate space, so an unfiltered scan made surface soldiers charge at
    // ghosts standing "inside" the nest — CombatSystem refuses cross-layer hits,
    // so they arrived, found nothing, and the whole garrison thrashed.
    this.enemySnapshot.length = 0;
    for (const store of [COMPONENT.BEETLE, COMPONENT.CRICKET]) {
      for (const id of this.world.query(store, COMPONENT.POSITION)) {
        const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER);
        if (layer && layer.layer !== Layer.Surface) continue;
        const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
        this.enemySnapshot.push({ id, x: pos.x, y: pos.y });
      }
    }
    // Rival faction units (Crystal drones, Human troops) the colony is at war with
    for (const id of [...this.world.query(COMPONENT.CRYSTAL_UNIT, COMPONENT.POSITION), ...this.world.query(HUMAN_COMPONENT.UNIT, COMPONENT.POSITION)]) {
      const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER);
      if (layer && layer.layer !== Layer.Surface) continue;
      if (!isHostileTo(this.world, FactionId.PLAYER, id)) continue;
      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      this.enemySnapshot.push({ id, x: pos.x, y: pos.y });
    }

    // Who is already engaging whom — drives focus fire (see selectSoldierTarget)
    this.antsEngaging.clear();
    for (const id of this.world.query(COMPONENT.ANT, COMPONENT.COMBAT)) {
      const combat = this.world.getComponent<CombatComponent>(id, COMPONENT.COMBAT)!;
      if (combat.targetEntityId === null) continue;
      this.antsEngaging.set(combat.targetEntityId, (this.antsEngaging.get(combat.targetEntityId) ?? 0) + 1);
    }

    this.foodSnapshot.length = 0;
    for (const id of this.world.query(COMPONENT.FOOD_SOURCE, COMPONENT.POSITION)) {
      // Surface ants must not "see" underground drops (layers share coordinates)
      const foodLayer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER);
      if (foodLayer && foodLayer.layer !== Layer.Surface) continue;
      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      const source = this.world.getComponent<FoodSourceComponent>(id, COMPONENT.FOOD_SOURCE);
      this.foodSnapshot.push({ id, x: pos.x, y: pos.y, type: source?.resourceType as FoodType | undefined });
    }

    this.mineralSnapshot.length = 0;
    for (const id of this.world.query(COMPONENT.MINERAL, COMPONENT.POSITION)) {
      const node = this.world.getComponent<MineralComponent>(id, COMPONENT.MINERAL)!;
      if (node.amount <= 0) continue;
      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      this.mineralSnapshot.push({ id, x: pos.x, y: pos.y });
      if (!this.nodePositions.has(id)) this.nodePositions.set(id, { x: pos.x, y: pos.y });
    }

    this.autonomousMiners = 0;
    this.orderedMiners = 0;
    this.workerCount = 0;
    this.minersByNode.clear();
    for (const id of this.world.query(COMPONENT.ANT)) {
      const ant = this.world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
      if (ant.role !== AntRole.Worker) continue;
      this.workerCount++;
      if (ant.resourceOrder === 'mine') this.orderedMiners++;
      if (ant.mineralTargetId == null) continue;
      this.minersByNode.set(ant.mineralTargetId, (this.minersByNode.get(ant.mineralTargetId) ?? 0) + 1);
      const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER);
      if (layer && layer.layer !== Layer.Surface) continue;
      if (ant.resourceOrder !== 'mine') this.autonomousMiners++;
    }
  }

  // ─── Miners: the colony's allocation and the player's target ───

  /** Mineras: N. null goes back to the automatic target (2, growing with the workforce). */
  setMinerTarget(target: number | null): void {
    this.minerTarget = clampMinerTarget(target);
    this.allocateTimer = 0; // act on it next tick
  }

  /** Autonomous miners the colony wants now. */
  private effectiveMinerTarget(): number {
    return this.minerTarget ?? autoMinerTarget(this.workerCount);
  }

  getMinerStatus(): MinerStatus {
    return {
      miners: this.autonomousMiners + this.orderedMiners,
      autonomous: this.autonomousMiners,
      ordered: this.orderedMiners,
      target: this.effectiveMinerTarget(),
      auto: this.minerTarget === null,
    };
  }

  /** A node the colony knows about (explored ground, not only what is in sight) and can mine safely. */
  private isDiscoveredNode(x: number, y: number): boolean {
    if (!this.visibilityGrid.isExplored(Math.round(x), Math.round(y))) return false;
    return this.enemySnapshot.length === 0 || !this.isGuardedByPredator(x, y);
  }

  /** A surface worker with nothing to do that the colony may send to a field. */
  private isFreeForMining(id: EntityId, ant: AntComponent): boolean {
    if (ant.role !== AntRole.Worker || ant.resourceOrder !== undefined || ant.mineralTargetId != null) return false;
    if (ant.state !== AntState.Idle && ant.state !== AntState.Searching) return false;
    if (this.world.getComponent(id, COMPONENT.PLAYER_ORDER)) return false;
    const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER);
    if (layer && layer.layer !== Layer.Surface) return false;
    if (this.transitSystem?.isInTransit(id)) return false;
    const carrying = this.world.getComponent<CarryingComponent>(id, COMPONENT.CARRYING);
    if (carrying && carrying.amount > 0) return false;
    if (this.attackerByTarget.has(id)) return false;
    return !(this.undergroundFoodAvailable && this.isHungry(id));
  }

  /**
   * Keep the miner target on the discovered fields: recruit free workers
   * (closest to the least-worked, nearest node first) or release the extra
   * ones. A miner holding ore keeps it until it is banked.
   */
  private allocateMiners(): void {
    const target = this.effectiveMinerTarget();
    if (this.autonomousMiners > target) {
      let extra = this.autonomousMiners - target;
      for (const id of this.world.query(COMPONENT.ANT, COMPONENT.PATH, COMPONENT.CARRYING)) {
        if (extra <= 0) break;
        const ant = this.world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
        if (ant.mineralTargetId == null || ant.resourceOrder === 'mine') continue;
        const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER);
        if (layer && layer.layer !== Layer.Surface) continue;
        if (this.world.getComponent<CarryingComponent>(id, COMPONENT.CARRYING)!.amount > 0) continue;
        const node = ant.mineralTargetId;
        this.minersByNode.set(node, Math.max(0, (this.minersByNode.get(node) ?? 1) - 1));
        this.stopMining(ant);
        if (ant.state === AntState.Mining) {
          ant.state = AntState.Searching;
          ant.stateTimer = 0;
          const path = this.world.getComponent<PathComponent>(id, COMPONENT.PATH)!;
          path.waypoints = [];
          path.currentIndex = 0;
        }
        this.autonomousMiners--;
        extra--;
      }
      return;
    }
    if (this.autonomousMiners >= target) return;

    const nodes = this.mineralSnapshot.filter((m) => this.isDiscoveredNode(m.x, m.y));
    if (nodes.length === 0) return;
    const free: Array<{ id: EntityId; ant: AntComponent; pos: PositionComponent }> = [];
    for (const id of this.world.query(COMPONENT.ANT, COMPONENT.POSITION, COMPONENT.PATH, COMPONENT.CARRYING)) {
      const ant = this.world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
      if (!this.isFreeForMining(id, ant)) continue;
      free.push({ id, ant, pos: this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)! });
    }
    while (this.autonomousMiners < target && free.length > 0) {
      // The node nearest home, spread so no single node gets everyone
      let node = nodes[0];
      let nodeScore = Infinity;
      for (const m of nodes) {
        const score = this.distToNestXY(m.x, m.y) + 6 * (this.minersByNode.get(m.id) ?? 0);
        if (score < nodeScore) {
          nodeScore = score;
          node = m;
        }
      }
      let pick = 0;
      for (let i = 1; i < free.length; i++) {
        const d = Math.hypot(free[i].pos.x - node.x, free[i].pos.y - node.y);
        if (d < Math.hypot(free[pick].pos.x - node.x, free[pick].pos.y - node.y)) pick = i;
      }
      const { id, ant, pos } = free.splice(pick, 1)[0];
      this.startMining(ant, pos, this.world.getComponent<PathComponent>(id, COMPONENT.PATH)!, node.id);
      this.minersByNode.set(node.id, (this.minersByNode.get(node.id) ?? 0) + 1);
      this.autonomousMiners++;
    }
  }

  /** The discovered node with ore closest to `from` within `reach` tiles, or null. */
  private nearestDiscoveredNode(from: Vector2, reach: number): EntityId | null {
    let best: EntityId | null = null;
    let bestDist = reach;
    for (const m of this.mineralSnapshot) {
      const dist = Math.hypot(m.x - from.x, m.y - from.y);
      if (dist > bestDist || !this.isDiscoveredNode(m.x, m.y)) continue;
      best = m.id;
      bestDist = dist;
    }
    return best;
  }

  /**
   * Send a free worker on a Minar or Recolectar order back to its source.
   * A miner goes back to Mining (handleMining routes it, and moves it to the
   * next node of the field when its node ran out). A gatherer whose source
   * is gone is done: the order ends and it goes back to its own work. True
   * when it took the ant for this tick.
   */
  private resumeResourceOrder(id: EntityId, ant: AntComponent, pos: PositionComponent, path: PathComponent): boolean {
    if (ant.resourceOrder === 'mine') {
      ant.state = AntState.Mining;
      ant.stateTimer = 0;
      path.waypoints = [];
      path.currentIndex = 0;
      return true;
    }
    const foodId = ant.foodTargetId ?? null;
    const food = foodId !== null ? this.world.getComponent<FoodSourceComponent>(foodId, COMPONENT.FOOD_SOURCE) : undefined;
    if (foodId === null || !food || food.amount <= 0) {
      clearResourceOrder(this.world, id);
      return false;
    }
    ant.state = AntState.GoingToFood;
    ant.stateTimer = 0;
    this.pathToEntity(pos, foodId, path);
    return true;
  }


  private handleSearching(
    id: EntityId,
    ant: AntComponent,
    pos: PositionComponent,
    path: PathComponent,
    dt: number
  ): void {
    // dt is passed for consistency but not used in this state
    void dt;

    // === Reactive combat: detect if being attacked ===
    const attackerId = this.attackerByTarget.get(id) ?? null;
    if (attackerId !== null) {
      const attackerPos = this.world.getComponent<PositionComponent>(attackerId, COMPONENT.POSITION);
      if (attackerPos) {
        if (ant.role === AntRole.Scout) {
          // Scouts deal ZERO damage (ROLE_STATS.scout.damage = 0). "Fighting back"
          // meant standing still taking hits for no reason — they mark and run.
          this.emitDangerPheromone(pos, DANGER_PHEROMONE_EMIT_STRENGTH);
          ant.state = AntState.Fleeing;
          ant.stateTimer = 0;
          this.pathAwayFrom(pos, { x: attackerPos.x, y: attackerPos.y }, path);
          return;
        } else if (ant.role === AntRole.Worker) {
          const nestDist = this.distToNest(pos);
          if (nestDist < WORKER_FIGHT_RANGE) {
            // Worker fights back near nest
            ant.state = AntState.AttackingEnemy;
            ant.stateTimer = 0;
            path.waypoints = [];
            path.currentIndex = 0;
            ensureCombatComponent(this.world, id, attackerId);
            return;
          } else {
            // Worker flees far from nest
            ant.state = AntState.Fleeing;
            ant.stateTimer = 0;
            this.pathAwayFrom(pos, { x: attackerPos.x, y: attackerPos.y }, path);
            return;
          }
        }
        // Soldiers handled by existing beetle detection code
      }
    }

    // === Hunger check: hungry ants go home to eat ===
    // Being hurt is NOT a reason to go home: ants heal by eating (see eat() in
    // HungerSystem), so a meal is what fixes both. And the trip only makes
    // sense if there is something down there to eat — otherwise the ant walks
    // home, finds nothing and walks back out, forever.
    if (ant.stateTimer > 0 && this.undergroundFoodAvailable && this.isHungry(id)) {
      ant.state = AntState.ReturningHome;
      ant.stateTimer = 0;
      this.pathToNest(pos, path);
      return;
    }

    // === Beetle detection (all roles) ===
    const nearbyBeetle = this.findNearestBeetle(pos);

    if (ant.role === AntRole.Scout && nearbyBeetle) {
      const roleStats = this.world.getComponent<RoleStatsComponent>(id, COMPONENT.ROLE_STATS);
      const scoutVision = roleStats ? roleStats.visionRange : 18;
      // Scouts SMELL trouble further than they can survive it — that gap is the
      // whole point of the role (SCOUT_BEETLE_DETECT_RANGE was declared for this
      // and never wired up).
      const alarmRange = Math.max(scoutVision, SCOUT_BEETLE_DETECT_RANGE);
      if (nearbyBeetle.dist < alarmRange) {
        // A scout that SEES a predator is the colony's early-warning system:
        // it marks the spot every time, not only when it is already bleeding.
        // That danger trail is exactly what soldiers follow (Priority 2 below).
        this.emitDangerPheromone(pos, DANGER_PHEROMONE_EMIT_STRENGTH);

        const health = this.world.getComponent<HealthComponent>(id, COMPONENT.HEALTH);
        const hurt = health !== undefined && health.current / health.max < SCOUT_FLEE_HEALTH_RATIO;
        if (hurt || nearbyBeetle.dist < scoutVision * 0.6) {
          ant.state = AntState.Fleeing;
          ant.stateTimer = 0;
          this.pathAwayFrom(pos, nearbyBeetle, path);
          return;
        }
        // Far enough to keep watching — scouting continues
      }
    }

    if (ant.role === AntRole.Soldier) {
      // Priority 1: Beetle in direct vision
      const roleStats = this.world.getComponent<RoleStatsComponent>(id, COMPONENT.ROLE_STATS);
      const soldierVision = roleStats ? roleStats.visionRange : 8;

      // Not "the closest bug" — the most THREATENING one: predators near the
      // nest raise a colony-wide alarm, and targets sisters are already biting
      // win ties so the squad focuses fire (which stacks with the flanking bonus).
      const threat = this.selectSoldierTarget(pos, soldierVision);
      if (threat) {
        ant.state = AntState.ChasingEnemy;
        ant.stateTimer = 0;
        this.pathToEntity(pos, threat.entityId, path);
        return;
      }

      // Priority 2: Danger pheromone detected — follow multi-tile trail
      // stateTimer > 1 prevents re-chasing right after giving up a chase (grace period)
      if (ant.stateTimer > 1) {
        const dangerLevel = this.sampleDangerPheromone(pos, 3);
        if (dangerLevel > SOLDIER_DANGER_CHASE_THRESHOLD) {
          const dangerTrail = this.generateScoredPath(pos, ant, 'danger');
          if (dangerTrail.length > 0) {
            ant.state = AntState.ChasingEnemy;
            ant.stateTimer = 0;
            path.waypoints = dangerTrail;
            path.currentIndex = 0;
            return;
          }
        }
      }

      // Priority 3: Patrol near nest when Defend priority
      // (den hunting is MANUAL only — via attack wave dispatch)
      if (this.colonyPriority === ColonyPriority.Defend) {
        ant.state = AntState.PatrollingNest;
        // A soldier that just gave up a chase keeps its grace period on patrol
        ant.stateTimer = Math.min(0, ant.stateTimer);
        this.pathToPatrolPoint(pos, path);
        return;
      }

      // Otherwise fall through to normal food gathering logic
    }

    if (ant.role === AntRole.Worker && nearbyBeetle) {
      const nestDist = this.distToNest(pos);
      if (nearbyBeetle.dist < 3) {
        if (nestDist < WORKER_FIGHT_RANGE) {
          // Worker fights near the nest
          ant.state = AntState.AttackingEnemy;
          ant.stateTimer = 0;
          path.waypoints = [];
          path.currentIndex = 0;
          ensureCombatComponent(this.world, id, nearbyBeetle.entityId);
          return;
        } else {
          // Worker flees when far from nest
          this.pathAwayFrom(pos, nearbyBeetle, path);
          return;
        }
      }
    }

    // === SCORING-BASED DECISION (replaces hardcoded priority chain) ===
    // Only re-evaluate when path is exhausted
    if (path.waypoints.length === 0 || path.currentIndex >= path.waypoints.length) {
      // Skip scoring during cooldown (negative stateTimer)
      if (ant.stateTimer < 0) return;

      const candidates = this.scoreActions(id, ant, pos);
      const chosen = this.selectAction(candidates);

      if (chosen) {
        switch (chosen.action) {
          case 'chase': {
            if (chosen.targetId) {
              ant.state = AntState.ChasingEnemy;
              ant.stateTimer = 0;
              this.pathToEntity(pos, chosen.targetId, path);
            } else {
              // Follow danger pheromone trail
              ant.state = AntState.ChasingEnemy;
              ant.stateTimer = 0;
              const dangerTrail = this.generateScoredPath(pos, ant, 'danger');
              if (dangerTrail.length > 0) {
                path.waypoints = dangerTrail;
                path.currentIndex = 0;
              }
            }
            break;
          }
          case 'gather': {
            if (chosen.targetId) {
              ant.state = AntState.GoingToFood;
              ant.stateTimer = 0;
              this.pathToEntity(pos, chosen.targetId, path);
            } else {
              // Follow food pheromone via scored path (stay in Searching)
              const foodTrail = this.generateScoredPath(pos, ant, 'food');
              if (foodTrail.length > 0) {
                path.waypoints = foodTrail;
                path.currentIndex = 0;
              }
            }
            break;
          }
          case 'mine': {
            if (chosen.targetId !== undefined) this.startMining(ant, pos, path, chosen.targetId);
            break;
          }
          case 'explore': {
            const exploreTrail = this.generateScoredPath(pos, ant, 'explore');
            if (exploreTrail.length > 0) {
              path.waypoints = exploreTrail;
              path.currentIndex = 0;
            }
            break;
          }
          case 'patrol': {
            ant.state = AntState.PatrollingNest;
            ant.stateTimer = 0;
            this.pathToPatrolPoint(pos, path);
            break;
          }
        }
      } else {
        // Fallback: single tile move away from nest
        const nestPos = this.nestEntityId
          ? this.world.getComponent<PositionComponent>(this.nestEntityId, COMPONENT.POSITION)
          : null;
        if (nestPos) {
          const target = this.fallbackMoveToward(pos, {
            x: pos.x + (pos.x - nestPos.x) * 0.5,
            y: pos.y + (pos.y - nestPos.y) * 0.5,
          });
          if (target) {
            path.waypoints = [target];
            path.currentIndex = 0;
          }
        }
      }
    }

    // Timeout: if searching for too long, reset with cooldown
    if (ant.stateTimer > 6) {
      path.waypoints = [];
      path.currentIndex = 0;
      ant.stateTimer = -2;
    }
  }

  private handleGoingToFood(
    _id: EntityId,
    ant: AntComponent,
    pos: PositionComponent,
    path: PathComponent,
    carrying: CarryingComponent
  ): void {
    // Already loaded (e.g. came back up with a full pantry) — never harvest on
    // top of a held load: that overwrote and LOST the food. Go deposit instead.
    if (carrying.amount > 0) {
      ant.state = AntState.ReturningHome;
      ant.stateTimer = 0;
      this.pathToNest(pos, path);
      return;
    }

    // Check if we're near any food source (snapshot is surface-only already).
    // A worker on a Recolectar order takes from its own source first.
    const ordered = ant.resourceOrder === 'gather' ? ant.foodTargetId ?? null : null;
    const sources = ordered === null ? this.foodSnapshot : [...this.foodSnapshot].sort((a, b) => Number(b.id === ordered) - Number(a.id === ordered));
    for (const f of sources) {
      const dx = f.x - pos.x;
      const dy = f.y - pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < ANT_HARVEST_RANGE) {
        // Re-fetch: another ant may have depleted this source earlier this tick
        const food = this.world.getComponent<FoodSourceComponent>(f.id, COMPONENT.FOOD_SOURCE);
        if (!food || food.amount <= 0) continue;
        const foodId = f.id;
        // Harvest and convert to STORED UNITS right here (nutrition multipliers
        // apply once, at the source) — loads are pantry-typed everywhere, so no
        // stage can ever double-convert or misclassify them
        const harvestAmount = Math.min(carrying.maxCapacity, food.amount);
        food.amount -= harvestAmount;
        const mult =
          food.resourceType === FoodType.GiantMushroom ? GIANT_MUSHROOM_NUTRITION_MULTIPLIER :
          food.resourceType === FoodType.BeetleMeat ? BEETLE_MEAT_NUTRITION_MULTIPLIER :
          food.resourceType === FoodType.CricketMeat ? CRICKET_MEAT_NUTRITION_MULTIPLIER :
          food.resourceType === FoodType.Mushroom ? MUSHROOM_NUTRITION_MULTIPLIER : 1.0;
        carrying.amount = harvestAmount * mult;
        carrying.resourceType =
          food.resourceType === FoodType.Mushroom || food.resourceType === FoodType.GiantMushroom
            ? 'mushroom'
            : food.resourceType === FoodType.BeetleMeat || food.resourceType === FoodType.CricketMeat
              ? 'meat'
              : 'leaf';

        // Remove food if depleted
        if (food.amount <= 0) {
          this.world.destroyEntity(foodId);
        }

        // Head back home
        ant.state = AntState.ReturningHome;
        ant.stateTimer = 0;
        this.pathToNest(pos, path);
        return;
      }
    }

    // If path ended but no food, go back to searching
    if (path.currentIndex >= path.waypoints.length) {
      ant.state = AntState.Searching;
      ant.stateTimer = 0;
    }
  }

  private handleReturningHome(
    _id: EntityId,
    ant: AntComponent,
    pos: PositionComponent,
    path: PathComponent,
    carrying: CarryingComponent
  ): void {
    if (!this.hasNest()) return;

    const nestPos = this.world.getComponent<PositionComponent>(this.nestEntityId!, COMPONENT.POSITION);
    if (!nestPos) return;

    const dist = this.distance(pos, nestPos);
    if (dist < ANT_DEPOSIT_RANGE) {
      ant.stateTimer = 0;
      if (carrying.amount > 0 && isOreLoad(carrying.resourceType)) {
        // ORE IS NOT FOOD: it goes straight to the minerals bank at the
        // entrance, never down the shaft and never into the pantry
        this.world.minerals.deposit(carrying.amount, { x: pos.x, y: pos.y });
        carrying.amount = 0;
        carrying.resourceType = null;
        this.afterOreDelivery(_id, ant, pos, path);
      } else if (carrying.amount > 0 && ant.role === AntRole.Worker && !this.pantryHasRoomFor(carrying.resourceType)) {
        // The pantry is full: riding down only to come back up still holding
        // the load kept every worker shuttling in the shaft, with nobody left
        // to forage or mine. The load goes on the entrance pile (porters carry
        // it down once there is room) and the worker gets back to work.
        this.dropAtStockpile(carrying);
        ant.state = AntState.Searching;
      } else if (carrying.amount > 0 && ant.role === AntRole.Worker) {
        // FOOD IS ONLY STORED UNDERGROUND: the load is already in stored units
        // (converted at harvest) — carry it down to the pantry. PorterSystem's
        // Hauling drives the rest; if the pantry is full the ant holds the food.
        ant.state = AntState.Hauling;
        if (this.transitSystem) this.transitSystem.requestTransit(_id, 'enter');
      } else if (carrying.amount > 0) {
        // Soldiers and scouts are not porters: PorterSystem only drives
        // workers, so a non-worker sent down as a Hauler froze at the shaft
        // holding its load (soldiers got bounced back up and froze on the nest
        // tile). They drop the load on the nest stockpile — worker porters
        // carry it below — and go back to their own job.
        this.dropAtStockpile(carrying);
        ant.state = AntState.Searching;
      } else if (this.isHungry(_id) && this.undergroundFoodAvailable && this.transitSystem) {
        // Came home hungry: ride down and eat (eating also heals)
        ant.state = AntState.Healing;
        this.transitSystem.requestTransit(_id, 'enter');
      } else {
        // Nothing to deliver, nothing to eat — never stand at the entrance
        ant.state = AntState.Searching;
      }
      return;
    }

    // Stuck timeout: if returning home for too long, drop food and search again.
    // Entrance-proximity exemption: an ant this close is about to deliver, so it
    // keeps walking its route (re-pathing it here EVERY tick froze the ant: an
    // A* route starts at the ant's own tile, so each tick it snapped back there).
    if (ant.stateTimer > RETURNING_HOME_DROP_TIMEOUT && dist >= ANT_DEPOSIT_RANGE * 3) {
      if (isOreLoad(carrying.resourceType)) {
        // Ore never spoils and is never eaten: dropping it would just destroy
        // minerals. The miner keeps it and tries a fresh route home.
        ant.stateTimer = 0;
        path.waypoints = [];
        path.currentIndex = 0;
        this.pathToNest(pos, path);
        return;
      }
      carrying.amount = 0;
      carrying.resourceType = null;
      ant.state = AntState.Searching;
      ant.stateTimer = 0;
      path.waypoints = [];
      path.currentIndex = 0;
      return;
    }

    // If path ended but not at nest, repath (with fallback)
    if (path.currentIndex >= path.waypoints.length) {
      this.pathToNest(pos, path);
    }
  }

  /** Bind a worker to a mineral node and send it there */
  private startMining(ant: AntComponent, pos: PositionComponent, path: PathComponent, nodeId: EntityId): void {
    ant.state = AntState.Mining;
    ant.stateTimer = 0;
    ant.mineralTargetId = nodeId;
    ant.miningProgress = 0;
    this.pathToEntity(pos, nodeId, path);
  }

  /** Release a worker from mining: it goes back to the colony's scoring */
  private stopMining(ant: AntComponent): void {
    ant.mineralTargetId = null;
    ant.miningProgress = 0;
  }

  /**
   * Mining: walk to the bound node, chip at it for MINERAL_MINE_SECONDS, then
   * carry MINERAL_TRIP_AMOUNT of ore home (handleReturningHome banks it).
   */
  private handleMining(
    id: EntityId,
    ant: AntComponent,
    pos: PositionComponent,
    path: PathComponent,
    carrying: CarryingComponent,
    dt: number
  ): void {
    // Never chip on top of a held load: deliver it first
    if (carrying.amount > 0) {
      ant.state = AntState.ReturningHome;
      ant.stateTimer = 0;
      this.pathToNest(pos, path);
      return;
    }

    // Under attack: drop to the ordinary worker reaction (fight near home, flee far away)
    if (this.attackerByTarget.has(id)) {
      ant.state = AntState.Searching;
      ant.stateTimer = 0;
      this.handleSearching(id, ant, pos, path, dt);
      return;
    }

    const nodeId = ant.mineralTargetId ?? null;
    const node = nodeId !== null ? this.world.getComponent<MineralComponent>(nodeId, COMPONENT.MINERAL) : undefined;
    const nodePos = nodeId !== null ? this.world.getComponent<PositionComponent>(nodeId, COMPONENT.POSITION) : undefined;
    if (nodeId === null || !node || !nodePos || node.amount <= 0) {
      // Node mined out: move on to the next node of the same field (one the
      // colony knows about), else one in sight
      const around = nodeId !== null ? this.nodePositions.get(nodeId) ?? pos : pos;
      const next = this.nearestDiscoveredNode(around, MINER_FIELD_REACH) ?? this.findNearestMineral(id, pos)?.id ?? null;
      if (next !== null) {
        this.startMining(ant, pos, path, next);
      } else {
        // The field is spent: a Minar order is done too
        clearResourceOrder(this.world, id);
        this.stopMining(ant);
        ant.state = AntState.Searching;
        ant.stateTimer = 0;
      }
      return;
    }

    if (this.distance(pos, nodePos) < ANT_HARVEST_RANGE) {
      path.waypoints = [];
      path.currentIndex = 0;
      ant.stateTimer = 0; // working, not lost
      ant.miningProgress = (ant.miningProgress ?? 0) + dt;
      if (ant.miningProgress < MINERAL_MINE_SECONDS) return;

      const take = Math.min(MINERAL_TRIP_AMOUNT, node.amount);
      node.amount -= take;
      carrying.amount = take;
      carrying.resourceType = ORE_LOAD;
      ant.miningProgress = 0;
      if (node.amount <= 0) this.world.destroyEntity(nodeId);

      ant.state = AntState.ReturningHome;
      ant.stateTimer = 0;
      this.pathToNest(pos, path);
      return;
    }

    if (ant.stateTimer > MINING_GIVE_UP_SECONDS) {
      // Could not reach the node: forget it (and the order) and look for other work
      clearResourceOrder(this.world, id);
      this.stopMining(ant);
      ant.state = AntState.Searching;
      ant.stateTimer = 0;
      path.waypoints = [];
      path.currentIndex = 0;
      return;
    }

    if (path.currentIndex >= path.waypoints.length) {
      this.pathToEntity(pos, nodeId, path);
    }
  }

  /** Ore banked: a hungry miner goes down to eat, otherwise it walks back to its node */
  private afterOreDelivery(id: EntityId, ant: AntComponent, pos: PositionComponent, path: PathComponent): void {
    if (this.isHungry(id) && this.undergroundFoodAvailable && this.transitSystem) {
      // A Minar order keeps its node: the miner goes back to it after eating
      if (ant.resourceOrder !== 'mine') this.stopMining(ant);
      ant.state = AntState.Healing;
      this.transitSystem.requestTransit(id, 'enter');
      return;
    }
    const nodeId = ant.mineralTargetId ?? null;
    const node = nodeId !== null ? this.world.getComponent<MineralComponent>(nodeId, COMPONENT.MINERAL) : undefined;
    if (ant.role === AntRole.Worker && nodeId !== null && node && node.amount > 0) {
      this.startMining(ant, pos, path, nodeId);
      return;
    }
    if (ant.resourceOrder === 'mine') {
      // Its node ran out while it was away: handleMining finds the next one
      ant.state = AntState.Mining;
      ant.stateTimer = 0;
      return;
    }
    this.stopMining(ant);
    ant.state = AntState.Searching;
  }

  /** Nearest surface mineral node with ore in this ant's vision (predator-guarded nodes skipped) */
  private findNearestMineral(id: EntityId, pos: PositionComponent): { id: EntityId; dist: number } | null {
    const roleStats = this.world.getComponent<RoleStatsComponent>(id, COMPONENT.ROLE_STATS);
    const visionRange = roleStats ? roleStats.visionRange : 10;
    let best: { id: EntityId; dist: number } | null = null;
    for (const m of this.mineralSnapshot) {
      const dist = Math.hypot(m.x - pos.x, m.y - pos.y);
      if (dist >= visionRange || (best && dist >= best.dist)) continue;
      if (this.enemySnapshot.length > 0 && this.isGuardedByPredator(m.x, m.y)) continue;
      best = { id: m.id, dist };
    }
    return best;
  }

  private handleFleeing(
    _id: EntityId,
    ant: AntComponent,
    pos: PositionComponent,
    path: PathComponent
  ): void {
    // Keep emitting danger pheromone trail while fleeing
    this.emitDangerPheromone(pos, DANGER_PHEROMONE_TRAIL_STRENGTH);

    // Check if we've fled far enough or reached nest
    const nearbyBeetle = this.findNearestBeetle(pos);
    const beetleDist = nearbyBeetle ? nearbyBeetle.dist : Infinity;

    if (beetleDist > SCOUT_FLEE_DISTANCE || ant.stateTimer > 8) {
      ant.state = AntState.Searching;
      ant.stateTimer = 0;
      path.waypoints = [];
      path.currentIndex = 0;
      return;
    }

    // If path ended but still too close, repath away
    if (path.currentIndex >= path.waypoints.length && nearbyBeetle) {
      this.pathAwayFrom(pos, nearbyBeetle, path);
    }
  }

  private handleChasingEnemy(
    id: EntityId,
    ant: AntComponent,
    pos: PositionComponent,
    path: PathComponent
  ): void {
    // TARGET PERSISTENCE: re-picking "the nearest" every tick made squads
    // oscillate — two beetles at similar range and half the soldiers swapped
    // sides each frame, arriving nowhere. Stick with the committed target while
    // it is still worth chasing; only then look for a new one.
    const committed = this.committedTarget(id, pos);
    const chosen =
      committed ??
      (ant.role === AntRole.Soldier
        ? this.selectSoldierTarget(pos, SOLDIER_CHASE_RANGE)
        : this.findNearestBeetle(pos));

    // Beetle visible and in chase range → actively pursue
    if (chosen && chosen.dist <= SOLDIER_CHASE_RANGE) {
      // In attack range → switch to attacking
      if (chosen.dist < SOLDIER_ATTACK_RANGE) {
        ant.state = AntState.AttackingEnemy;
        ant.stateTimer = 0;
        path.waypoints = [];
        path.currentIndex = 0;
        ensureCombatComponent(this.world, id, chosen.entityId);
        return;
      }

      // Keep the claim fresh so allies see it in the focus-fire map
      ensureCombatComponent(this.world, id, chosen.entityId);

      // Repath to beetle periodically
      if (path.currentIndex >= path.waypoints.length || ant.stateTimer > 2) {
        this.pathToEntity(pos, chosen.entityId, path);
        if (ant.stateTimer > 2) ant.stateTimer = 0;
      }
      return;
    }

    // No beetle visible — keep walking current path (from pheromone trail entry)
    if (path.currentIndex < path.waypoints.length) {
      // Still following trail — timeout after 5s with no beetle in sight
      if (ant.stateTimer > 5) {
        ant.state = AntState.Searching;
        ant.stateTimer = -3; // grace period before re-chasing pheromone
        path.waypoints = [];
        path.currentIndex = 0;
      }
      return;
    }

    // Path exhausted AND no beetle → give up immediately
    ant.state = AntState.Searching;
    ant.stateTimer = -3; // 3s grace before re-chasing pheromone
    path.waypoints = [];
    path.currentIndex = 0;
  }

  private handleAttackingEnemy(
    id: EntityId,
    ant: AntComponent,
    pos: PositionComponent,
    path: PathComponent
  ): void {
    const combat = this.world.getComponent<CombatComponent>(id, COMPONENT.COMBAT);
    if (!combat || combat.targetEntityId === null) {
      ant.state = AntState.Searching;
      ant.stateTimer = 0;
      return;
    }

    // Check target still exists
    if (!this.world.hasEntity(combat.targetEntityId)) {
      combat.targetEntityId = null;
      ant.state = AntState.Searching;
      ant.stateTimer = 0;
      return;
    }

    const targetPos = this.world.getComponent<PositionComponent>(combat.targetEntityId, COMPONENT.POSITION);
    if (!targetPos) {
      combat.targetEntityId = null;
      ant.state = AntState.Searching;
      ant.stateTimer = 0;
      return;
    }

    const dist = this.distance(pos, targetPos);

    // Target fled out of range — resume chase
    if (dist > SOLDIER_ATTACK_RANGE * 1.5) {
      ant.state = AntState.ChasingEnemy;
      ant.stateTimer = 0;
      combat.targetEntityId = null;
      return;
    }

    // Role-specific combat exit conditions
    if (ant.role === AntRole.Scout) {
      // Scouts do no damage — any melee is a losing trade regardless of HP
      this.emitDangerPheromone(pos, DANGER_PHEROMONE_EMIT_STRENGTH);
      ant.state = AntState.Fleeing;
      ant.stateTimer = 0;
      this.pathAwayFrom(pos, targetPos, path);
      combat.targetEntityId = null;
      return;
    } else if (ant.role === AntRole.Worker) {
      const nestDist = this.distToNest(pos);
      if (nestDist > WORKER_FIGHT_RANGE) {
        // Worker is too far from nest — disengage
        ant.state = AntState.Searching;
        ant.stateTimer = 0;
        this.pathAwayFrom(pos, targetPos, path);
        combat.targetEntityId = null;
        return;
      }
    }

    // Stay still while attacking — CombatSystem handles damage
    path.waypoints = [];
    path.currentIndex = 0;
  }

  private handlePatrollingNest(
    id: EntityId,
    ant: AntComponent,
    pos: PositionComponent,
    path: PathComponent
  ): void {
    // Check for threats while patrolling — same policy soldiers use everywhere
    const roleStats = this.world.getComponent<RoleStatsComponent>(id, COMPONENT.ROLE_STATS);
    const vision = roleStats ? roleStats.visionRange : 8;

    const patrolThreat = this.selectSoldierTarget(pos, vision);
    if (patrolThreat) {
      ant.state = AntState.ChasingEnemy;
      ant.stateTimer = 0;
      this.pathToEntity(pos, patrolThreat.entityId, path);
      return;
    }

    // Check danger pheromone — follow multi-tile trail. Same grace period as
    // Searching: a soldier that just followed a cold trail back from an old
    // fight otherwise turned around on the spot, flip-flopping between the
    // patrol and the trail forever instead of coming home to defend.
    const dangerLevel = ant.stateTimer > 1 ? this.sampleDangerPheromone(pos, 3) : 0;
    if (dangerLevel > SOLDIER_DANGER_CHASE_THRESHOLD) {
      const dangerTrail = this.generateScoredPath(pos, ant, 'danger');
      if (dangerTrail.length > 0) {
        ant.state = AntState.ChasingEnemy;
        ant.stateTimer = 0;
        path.waypoints = dangerTrail;
        path.currentIndex = 0;
        return;
      }
    }

    // Hunger check: hungry soldiers break patrol to go eat — if there is food
    // below. Without that guard a starving soldier would flip-flop between patrol
    // and the nest entrance. (Being hurt is no reason to leave: eating heals.)
    if (this.undergroundFoodAvailable && this.isHungry(id)) {
      ant.state = AntState.ReturningHome;
      ant.stateTimer = 0;
      this.pathToNest(pos, path);
      return;
    }

    // If no longer in Defend priority, go gather
    if (this.colonyPriority !== ColonyPriority.Defend) {
      ant.state = AntState.Searching;
      ant.stateTimer = 0;
      return;
    }

    // Continue patrol — pick new point when path ends
    if (path.currentIndex >= path.waypoints.length) {
      this.pathToPatrolPoint(pos, path);
    }
  }

  private isHungry(id: EntityId): boolean {
    const hunger = this.world.getComponent<HungerComponent>(id, COMPONENT.HUNGER);
    return hunger !== undefined && hunger.current < hunger.max * HUNGER_EAT_THRESHOLD;
  }

  /** Whether the pantry can take a load of this type (no underground wired: assume it can). */
  private pantryHasRoomFor(resourceType: string | null): boolean {
    if (!this.undergroundGrid) return true;
    const type: PantryFoodType = resourceType === 'mushroom' || resourceType === 'meat' ? resourceType : 'leaf';
    return this.undergroundGrid.hasDepositSpace([type]);
  }

  /** Hand a load to the nest's surface stockpile — worker porters haul it below */
  private dropAtStockpile(carrying: CarryingComponent): void {
    const nest = this.world.getComponent<NestComponent>(this.nestEntityId!, COMPONENT.NEST);
    if (!nest) return;
    nest.foodStored += carrying.amount;
    this.world.runTally.foodGathered += carrying.amount;
    if (carrying.resourceType === 'mushroom') nest.mushroomStored += carrying.amount;
    else if (carrying.resourceType === 'meat') nest.meatStored += carrying.amount;
    carrying.amount = 0;
    carrying.resourceType = null;
  }

  /** Pantry full and a pile already waiting at the entrance: more forage would only rot */
  private computeSurfaceGlut(): boolean {
    if (!this.undergroundGrid || this.nestEntityId === null) return false;
    const nest = this.world.getComponent<NestComponent>(this.nestEntityId, COMPONENT.NEST);
    if (!nest || nest.foodStored < SURFACE_GLUT_PILE) return false;
    return !this.undergroundGrid.hasDepositSpace();
  }

  private computeUndergroundFood(): boolean {
    if (!this.undergroundGrid) return false;
    if (this.undergroundGrid.getPantryStored().total >= 1) return true;
    for (const fid of this.world.query(COMPONENT.FOOD_SOURCE, COMPONENT.LAYER)) {
      const layer = this.world.getComponent<LayerComponent>(fid, COMPONENT.LAYER)!;
      if (layer.layer === Layer.Underground) return true;
    }
    return false;
  }

  private findNearestFoodEntity(entityId: EntityId, pos: PositionComponent, ant: AntComponent): { entityId: EntityId; dist: number; foodType?: FoodType } | null {
    let nearest: { entityId: EntityId; dist: number; foodType?: FoodType } | null = null;
    let nearestDist = Infinity;

    // Determine vision range from role stats
    const roleStats = this.world.getComponent<RoleStatsComponent>(entityId, COMPONENT.ROLE_STATS);
    const visionRange = roleStats ? roleStats.visionRange : 10;

    // Foraging next to a beetle is how colonies feed their own predators. Ants
    // skip guarded piles — unless they are starving, in which case the risk is
    // the better bet, or they are soldiers, who are not the ones running away.
    const hunger = this.world.getComponent<HungerComponent>(entityId, COMPONENT.HUNGER);
    const desperate = hunger !== undefined && hunger.current < hunger.max * HUNGER_EAT_THRESHOLD;
    const avoidGuarded = ant.role !== AntRole.Soldier && !desperate && this.enemySnapshot.length > 0;

    for (const f of this.foodSnapshot) {
      const dx = f.x - pos.x;
      const dy = f.y - pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // Only "see" food within vision range
      if (dist >= visionRange) continue;

      if (avoidGuarded && this.isGuardedByPredator(f.x, f.y)) continue;

      // Mushrooms are "perceived" as closer (more desirable)
      const effectiveDist = f.type === FoodType.Mushroom ? dist * MUSHROOM_PREFERENCE_MULTIPLIER : dist;

      if (effectiveDist < nearestDist) {
        nearestDist = effectiveDist;
        nearest = { entityId: f.id, dist, foodType: f.type };
      }
    }

    return nearest;
  }

  /** Is a surface predator sitting on top of this food pile? */
  private isGuardedByPredator(x: number, y: number): boolean {
    for (const e of this.enemySnapshot) {
      if (Math.hypot(e.x - x, e.y - y) < FORAGE_ENEMY_AVOID_RADIUS) return true;
    }
    return false;
  }

  /** The enemy this ant already claimed, if it is alive, on the surface and still in reach */
  private committedTarget(
    id: EntityId,
    pos: PositionComponent
  ): { entityId: EntityId; dist: number; x: number; y: number } | null {
    const combat = this.world.getComponent<CombatComponent>(id, COMPONENT.COMBAT);
    if (!combat || combat.targetEntityId === null) return null;
    const target = combat.targetEntityId;

    for (const e of this.enemySnapshot) {
      if (e.id !== target) continue;
      const dist = Math.hypot(e.x - pos.x, e.y - pos.y);
      return dist <= SOLDIER_CHASE_RANGE ? { entityId: e.id, dist, x: e.x, y: e.y } : null;
    }
    return null;
  }

  /**
   * Soldier target policy — three ideas the old "nearest beetle" had none of:
   *
   * 1. PROXIMITY: closer is still better, but it is a weight, not a verdict.
   * 2. ALARM: a predator inside NEST_THREAT_RADIUS of the nest outranks
   *    anything else, and soldiers standing on home turf answer it even when
   *    it sits outside their personal vision — that is what an alarm IS.
   * 3. FOCUS FIRE: every sister already biting a target makes it more
   *    attractive. CombatSystem grants a flanking damage bonus for swarming,
   *    so converging is strictly better than each soldier picking its own bug.
   *
   * `within` keeps only enemies inside that circle (a player order's bounds).
   */
  private selectSoldierTarget(
    pos: PositionComponent,
    visionRange: number,
    within?: { x: number; y: number; radius: number }
  ): { entityId: EntityId; dist: number; x: number; y: number; score: number } | null {
    const selfNestDist = this.distToNest(pos);
    let best: { entityId: EntityId; dist: number; x: number; y: number; score: number } | null = null;

    for (const e of this.enemySnapshot) {
      // Player orders bound the search: an attack-move to its vision, a guard post to its leash
      if (within && Math.hypot(e.x - within.x, e.y - within.y) > within.radius) continue;
      const dist = Math.hypot(e.x - pos.x, e.y - pos.y);
      const enemyNestDist = this.distToNestXY(e.x, e.y);
      const alarm = enemyNestDist < NEST_THREAT_RADIUS && selfNestDist < NEST_THREAT_RADIUS * 2;

      if (dist >= visionRange && !alarm) continue;

      let score = ACTION_SCORE.DANGER_NEARBY_BONUS * (visionRange / (visionRange + dist));
      const engaged = Math.min(this.antsEngaging.get(e.id) ?? 0, SOLDIER_MAX_FOCUS_ALLIES);
      score += SOLDIER_FOCUS_FIRE_BONUS * engaged;
      if (alarm) score += NEST_ALARM_SCORE * (1 - enemyNestDist / NEST_THREAT_RADIUS);

      if (!best || score > best.score) {
        best = { entityId: e.id, dist, x: e.x, y: e.y, score };
      }
    }

    return best;
  }

  private pathToNest(pos: PositionComponent, path: PathComponent): boolean {
    if (!this.hasNest()) return false;
    const nestPos = this.world.getComponent<PositionComponent>(this.nestEntityId!, COMPONENT.POSITION);
    if (!nestPos) return false;

    const newPath = findPath(
      this.grid,
      { x: Math.round(pos.x), y: Math.round(pos.y) },
      { x: Math.round(nestPos.x), y: Math.round(nestPos.y) }
    );
    if (newPath) {
      path.waypoints = newPath;
      path.currentIndex = 0;
      return true;
    }

    // Fallback: move toward nest direction stepping through walkable tiles
    const target = this.fallbackMoveToward(pos, nestPos);
    if (target) {
      path.waypoints = [target];
      path.currentIndex = 0;
      return true;
    }

    return false;
  }

  /** When A* fails, find a walkable tile roughly toward the target */
  private fallbackMoveToward(pos: PositionComponent, target: { x: number; y: number }): Vector2 | null {
    const dx = target.x - pos.x;
    const dy = target.y - pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.5) return null;

    // Try stepping toward target in decreasing step sizes
    const nx = dx / dist;
    const ny = dy / dist;

    for (let step = 5; step >= 1; step--) {
      const tx = Math.round(pos.x + nx * step);
      const ty = Math.round(pos.y + ny * step);
      if (this.grid.isWalkable(tx, ty)) {
        return { x: tx, y: ty };
      }
      // Also try slightly off-angle (±30°)
      for (const angle of [0.5, -0.5]) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const rnx = nx * cos - ny * sin;
        const rny = nx * sin + ny * cos;
        const rx = Math.round(pos.x + rnx * step);
        const ry = Math.round(pos.y + rny * step);
        if (this.grid.isWalkable(rx, ry)) {
          return { x: rx, y: ry };
        }
      }
    }

    return null;
  }

  private depositPheromone(pos: PositionComponent, type: 'food' | 'home', strength: number): void {
    const tileX = Math.round(pos.x);
    const tileY = Math.round(pos.y);
    const tile = this.grid.getTile(tileX, tileY);
    if (!tile) return;

    if (type === 'food') {
      tile.foodPheromone = Math.min(PHEROMONE_MAX, tile.foodPheromone + strength);
    } else {
      tile.homePheromone = Math.min(PHEROMONE_MAX, tile.homePheromone + strength);
    }
  }

  private findNearestBeetle(pos: PositionComponent): { entityId: EntityId; dist: number; x: number; y: number } | null {
    let nearest: { entityId: EntityId; dist: number; x: number; y: number } | null = null;
    let nearestSq = Infinity;

    for (const e of this.enemySnapshot) {
      const dx = e.x - pos.x;
      const dy = e.y - pos.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < nearestSq) {
        nearestSq = distSq;
        nearest = { entityId: e.id, dist: 0, x: e.x, y: e.y };
      }
    }

    if (nearest) nearest.dist = Math.sqrt(nearestSq);
    return nearest;
  }

  private emitDangerPheromone(pos: PositionComponent, strength: number): void {
    const tileX = Math.round(pos.x);
    const tileY = Math.round(pos.y);
    const tile = this.grid.getTile(tileX, tileY);
    if (tile) {
      tile.dangerPheromone = Math.min(PHEROMONE_MAX, tile.dangerPheromone + strength);
    }
  }

  private pathAwayFrom(
    pos: PositionComponent,
    threat: { x: number; y: number },
    path: PathComponent
  ): void {
    const dx = pos.x - threat.x;
    const dy = pos.y - threat.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const currentPos = { x: Math.round(pos.x), y: Math.round(pos.y) };

    // Determine flee direction
    let nx: number, ny: number;
    if (dist < 0.1) {
      // Too close — pick random direction
      const angle = Math.random() * Math.PI * 2;
      nx = Math.cos(angle);
      ny = Math.sin(angle);
    } else {
      nx = dx / dist;
      ny = dy / dist;
    }

    // Try fleeing away with A* path, various distances and angles
    for (let fleeDist = 12; fleeDist >= 4; fleeDist -= 2) {
      // Try main direction + two offset angles
      for (const angleOffset of [0, 0.5, -0.5]) {
        const cos = Math.cos(angleOffset);
        const sin = Math.sin(angleOffset);
        const rnx = nx * cos - ny * sin;
        const rny = nx * sin + ny * cos;
        const tx = Math.round(pos.x + rnx * fleeDist);
        const ty = Math.round(pos.y + rny * fleeDist);

        if (tx < 0 || tx >= this.grid.width || ty < 0 || ty >= this.grid.height) continue;
        if (!this.grid.isWalkable(tx, ty)) continue;

        const newPath = findPath(this.grid, currentPos, { x: tx, y: ty });
        if (newPath && newPath.length > 1) {
          path.waypoints = newPath;
          path.currentIndex = 0;
          return;
        }
      }
    }

    // Fallback: path to nest
    this.pathToNest(pos, path);
  }

  private pathToEntity(pos: PositionComponent, targetId: EntityId, path: PathComponent): void {
    const targetPos = this.world.getComponent<PositionComponent>(targetId, COMPONENT.POSITION);
    if (!targetPos) return;

    const newPath = findPath(
      this.grid,
      { x: Math.round(pos.x), y: Math.round(pos.y) },
      { x: Math.round(targetPos.x), y: Math.round(targetPos.y) }
    );

    if (newPath && newPath.length > 0) {
      path.waypoints = newPath;
      path.currentIndex = 0;
    } else {
      // Fallback: direct move
      const target = this.fallbackMoveToward(pos, targetPos);
      if (target) {
        path.waypoints = [target];
        path.currentIndex = 0;
      }
    }
  }

  private pathToPatrolPoint(pos: PositionComponent, path: PathComponent): void {
    if (!this.hasNest()) return;
    const nestPos = this.world.getComponent<PositionComponent>(this.nestEntityId!, COMPONENT.POSITION);
    if (!nestPos) return;

    const startAngle = Math.random() * Math.PI * 2;
    const currentPos = { x: Math.round(pos.x), y: Math.round(pos.y) };

    // Try multiple angles — don't give up after one miss
    for (let attempt = 0; attempt < 8; attempt++) {
      const angle = startAngle + (attempt * Math.PI / 4);
      const tx = Math.round(nestPos.x + Math.cos(angle) * SOLDIER_PATROL_RADIUS);
      const ty = Math.round(nestPos.y + Math.sin(angle) * SOLDIER_PATROL_RADIUS);

      if (tx < 0 || tx >= this.grid.width || ty < 0 || ty >= this.grid.height) continue;
      if (!this.grid.isWalkable(tx, ty)) continue;

      const newPath = findPath(this.grid, currentPos, { x: tx, y: ty });
      if (newPath && newPath.length > 1) {
        path.waypoints = newPath;
        path.currentIndex = 0;
        return;
      }
    }
  }

  private distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private distToNest(pos: { x: number; y: number }): number {
    if (this.nestEntityId === null) return Infinity;
    const nestPos = this.world.getComponent<PositionComponent>(this.nestEntityId, COMPONENT.POSITION);
    if (!nestPos) return Infinity;
    return this.distance(pos, nestPos);
  }

  private distToNestXY(x: number, y: number): number {
    if (this.nestEntityId === null) return Infinity;
    const nestPos = this.world.getComponent<PositionComponent>(this.nestEntityId, COMPONENT.POSITION);
    if (!nestPos) return Infinity;
    const dx = x - nestPos.x;
    const dy = y - nestPos.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private sampleDangerPheromone(pos: PositionComponent, radius: number): number {
    let maxDanger = 0;
    const cx = Math.round(pos.x), cy = Math.round(pos.y);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const tile = this.grid.getTile(cx + dx, cy + dy);
        if (tile && tile.dangerPheromone > maxDanger) {
          maxDanger = tile.dangerPheromone;
        }
      }
    }
    return maxDanger;
  }

  private sampleFoodPheromone(pos: PositionComponent, radius: number): number {
    let maxFood = 0;
    const cx = Math.round(pos.x), cy = Math.round(pos.y);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const tile = this.grid.getTile(cx + dx, cy + dy);
        if (tile && tile.foodPheromone > maxFood) {
          maxFood = tile.foodPheromone;
        }
      }
    }
    return maxFood;
  }

  private sampleUnexploredRatio(pos: PositionComponent, visionRange: number): number {
    const cx = Math.round(pos.x), cy = Math.round(pos.y);
    let total = 0, unexplored = 0;
    const r = Math.min(visionRange, 6);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        total++;
        if (!this.visibilityGrid.isExplored(cx + dx, cy + dy)) {
          unexplored++;
        }
      }
    }
    return total > 0 ? unexplored / total : 0;
  }

  private scoreTile(
    neighbor: { x: number; y: number; tile: { foodPheromone: number; homePheromone: number; dangerPheromone: number; walkable: boolean } },
    fromX: number,
    fromY: number,
    intent: 'food' | 'explore' | 'danger',
    roleWeights: { food: number; danger: number; explore: number; patrol: number },
    priorityMult: { food: number; danger: number; explore: number }
  ): number {
    let score = 0.1;
    const tile = neighbor.tile;

    if (intent === 'food' || intent === 'explore') {
      score += (tile.foodPheromone / PHEROMONE_MAX) * TILE_SCORE.FOOD_PHEROMONE_WEIGHT * roleWeights.food * priorityMult.food;
      const currentNestDist = this.distToNestXY(fromX, fromY);
      const neighborNestDist = this.distToNestXY(neighbor.x, neighbor.y);
      if (neighborNestDist > currentNestDist) {
        score += TILE_SCORE.DISTANCE_FROM_NEST_BIAS;
      }
    }

    if (intent === 'danger') {
      score += (tile.dangerPheromone / PHEROMONE_MAX) * TILE_SCORE.DANGER_PHEROMONE_WEIGHT * roleWeights.danger * priorityMult.danger;
    } else if (tile.dangerPheromone > 5) {
      // Fear is the INVERSE of the role's appetite for danger: a worker walks
      // around a fresh danger trail, a soldier walks straight through it.
      // The old flat 0.3 penalty was so small that foragers marched over the
      // exact tiles a scout had just marked as lethal.
      const fear = Math.max(0, 1.2 - roleWeights.danger);
      score -= (tile.dangerPheromone / PHEROMONE_MAX) * TILE_SCORE.DANGER_AVOIDANCE_WEIGHT * fear;
    }

    if (intent === 'explore') {
      let unexploredCount = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (!this.visibilityGrid.isExplored(neighbor.x + dx, neighbor.y + dy)) {
            unexploredCount++;
          }
        }
      }
      score += unexploredCount * TILE_SCORE.UNEXPLORED_BONUS * roleWeights.explore * priorityMult.explore;
    }

    if (intent !== 'danger') {
      score += (tile.homePheromone / PHEROMONE_MAX) * TILE_SCORE.HOME_PHEROMONE_PENALTY;
    }

    // Apply jitter with noise multiplier from events
    const jitterRange = 0.4 * this.modifiers.decisionNoiseMultiplier;
    const jitterBase = Math.max(0, 1.0 - jitterRange * 0.5);
    score *= (jitterBase + Math.random() * jitterRange);
    return Math.max(0, score);
  }

  private weightedRandomTile(candidates: TileCandidate[]): TileCandidate {
    const totalScore = candidates.reduce((sum, c) => sum + c.score, 0);
    let roll = Math.random() * totalScore;
    for (const c of candidates) {
      roll -= c.score;
      if (roll <= 0) return c;
    }
    return candidates[candidates.length - 1];
  }

  private generateScoredPath(
    pos: PositionComponent,
    ant: AntComponent,
    intent: 'food' | 'explore' | 'danger'
  ): Vector2[] {
    const trail: Vector2[] = [];
    let cx = Math.round(pos.x);
    let cy = Math.round(pos.y);
    const roleWeights = ROLE_BASE_WEIGHTS[ant.role];
    const priorityMult = COLONY_PRIORITY_MULTIPLIERS[this.colonyPriority];
    const startX = cx;
    const startY = cy;

    for (let step = 0; step < TILE_SCORE.TRAIL_LENGTH; step++) {
      const neighbors = this.grid.getNeighbors(cx, cy);
      const tileCandidates: TileCandidate[] = [];

      for (const n of neighbors) {
        if (!n.tile.walkable) continue;
        if (n.x === startX && n.y === startY) continue;
        if (trail.some(t => t.x === n.x && t.y === n.y)) continue;

        const score = this.scoreTile(n, cx, cy, intent, roleWeights, priorityMult);
        if (score > TILE_SCORE.MIN_SCORE_THRESHOLD) {
          tileCandidates.push({ x: n.x, y: n.y, score });
        }
      }

      if (tileCandidates.length === 0) break;

      const selected = this.weightedRandomTile(tileCandidates);
      trail.push({ x: selected.x, y: selected.y });
      cx = selected.x;
      cy = selected.y;
    }

    return trail;
  }

  private scoreActions(
    id: EntityId,
    ant: AntComponent,
    pos: PositionComponent
  ): ActionCandidate[] {
    const candidates: ActionCandidate[] = [];
    const roleWeights = ROLE_BASE_WEIGHTS[ant.role];
    const priorityMult = COLONY_PRIORITY_MULTIPLIERS[this.colonyPriority];
    const roleStats = this.world.getComponent<RoleStatsComponent>(id, COMPONENT.ROLE_STATS);
    const visionRange = roleStats ? roleStats.visionRange : 8;

    // CHASE action (soldiers primarily)
    if (ant.role === AntRole.Soldier) {
      const threat = this.selectSoldierTarget(pos, visionRange);
      if (threat) {
        const score = threat.score * roleWeights.danger * priorityMult.danger;
        candidates.push({ action: 'chase', score, targetId: threat.entityId });
      } else {
        const dangerLevel = this.sampleDangerPheromone(pos, 3);
        if (dangerLevel > SOLDIER_DANGER_CHASE_THRESHOLD) {
          const score = (dangerLevel / PHEROMONE_MAX) * ACTION_SCORE.DANGER_NEARBY_BONUS
                        * roleWeights.danger * priorityMult.danger * 0.6;
          candidates.push({ action: 'chase', score });
        }
      }
    }

    // GATHER action — none while the entrance pile can't go below anyway
    const nearbyFood = this.surfaceGlut ? null : this.findNearestFoodEntity(id, pos, ant);
    if (nearbyFood) {
      const score = ACTION_SCORE.FOOD_VISION_BONUS * roleWeights.food * priorityMult.food;
      candidates.push({ action: 'gather', score, targetId: nearbyFood.entityId });
    } else {
      const foodPhero = this.surfaceGlut ? 0 : this.sampleFoodPheromone(pos, 3);
      if (foodPhero > 1.0) {
        const score = (foodPhero / PHEROMONE_MAX) * ACTION_SCORE.PHEROMONE_TRAIL_BONUS
                      * roleWeights.food * priorityMult.food;
        candidates.push({ action: 'gather', score });
      }
    }

    // MINE action (workers only): a mineral node in sight, while the colony
    // still wants miners (the target leaves the rest foraging food)
    if (ant.role === AntRole.Worker) {
      const node = this.autonomousMiners < this.effectiveMinerTarget() ? this.findNearestMineral(id, pos) : null;
      if (node) {
        const score = ACTION_SCORE.MINERAL_VISION_BONUS * roleWeights.food * priorityMult.food;
        candidates.push({ action: 'mine', score, targetId: node.id });
      }
    }

    // EXPLORE action (always a candidate — base explore desire)
    const unexploredRatio = this.sampleUnexploredRatio(pos, visionRange);
    const exploreScore = (unexploredRatio * ACTION_SCORE.EXPLORE_UNEXPLORED_BONUS + 1.5)
                         * roleWeights.explore * priorityMult.explore;
    candidates.push({ action: 'explore', score: exploreScore });

    // PATROL action (soldiers only, Defend priority)
    if (ant.role === AntRole.Soldier && this.colonyPriority === ColonyPriority.Defend) {
      const score = ACTION_SCORE.PATROL_DEFEND_BONUS * roleWeights.patrol;
      candidates.push({ action: 'patrol', score });
    }

    return candidates;
  }

  private selectAction(candidates: ActionCandidate[]): ActionCandidate | null {
    if (candidates.length === 0) return null;
    const totalScore = candidates.reduce((sum, c) => sum + c.score, 0);
    if (totalScore <= 0) return null;

    let roll = Math.random() * totalScore;
    for (const candidate of candidates) {
      roll -= candidate.score;
      if (roll <= 0) return candidate;
    }
    return candidates[candidates.length - 1];
  }
}
