import type { System } from '../../engine/ecs/types';
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
  type AntComponent,
  type PositionComponent,
  type CarryingComponent,
  type PathComponent,
  type FoodSourceComponent,
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
import { endPlayerOrder } from './helpers/playerOrders';
import type { UndergroundGrid } from '../../simulation/world/UndergroundGrid';
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
} from '../../shared/constants';

interface ActionCandidate {
  action: 'chase' | 'gather' | 'explore' | 'patrol';
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
  /** enemy id -> how many ants are already biting it (focus fire + flanking synergy) */
  private antsEngaging: Map<EntityId, number> = new Map();
  /** Recomputed once per tick — the hunger checks consult it per ant */
  private undergroundFoodAvailable = false;
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

    const ants = this.world.query(COMPONENT.ANT, COMPONENT.POSITION, COMPONENT.PATH, COMPONENT.CARRYING);

    for (const id of ants) {
      const order = this.world.getComponent<PlayerOrderComponent>(id, COMPONENT.PLAYER_ORDER);

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

      // A player order outranks the colony AI and every safety net below until
      // the ant arrives; then it goes Idle and this loop picks its job back up.
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
      // GoingToDen excluded — has its own timeout, soldiers must commit to the mission
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

        case AntState.GoingToDen:
          this.handleGoingToDen(id, ant, pos, path);
          break;

        case AntState.AttackingDen:
          this.handleAttackingDen(id, ant, pos, path);
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
   * Walk an ordered ant to its formation slot. Routes are rationed per tick
   * (orderRoutesLeft), so a big group starts over a few frames instead of
   * running 40 A* searches at once. The order ends on arrival, when a finished
   * route left the ant close enough (slot crowded or blocked), or when the slot
   * proves unreachable; the timeout is the last resort.
   */
  private followPlayerOrder(
    id: EntityId,
    ant: AntComponent,
    pos: PositionComponent,
    path: PathComponent,
    order: PlayerOrderComponent,
    dt: number
  ): void {
    order.elapsed += dt;
    ant.state = AntState.Moving;
    // Stall detection restarts from here, so the nets cannot fire the moment the order ends
    ant.stuckTimer = 0;
    ant.lastX = pos.x;
    ant.lastY = pos.y;

    const dist = Math.hypot(order.target.x - pos.x, order.target.y - pos.y);
    const routeDone = path.currentIndex >= path.waypoints.length;
    if (
      dist <= ORDER_ARRIVE_RADIUS ||
      order.elapsed > ORDER_TIMEOUT_SECONDS ||
      (routeDone && order.routes > 0 && dist <= ORDER_SETTLE_RADIUS) ||
      (routeDone && order.routes >= ORDER_MAX_ROUTES)
    ) {
      endPlayerOrder(this.world, id);
      return;
    }
    if (!routeDone || this.orderRoutesLeft <= 0) return;

    this.orderRoutesLeft--;
    order.routes++;
    const route = findPath(
      this.grid,
      { x: Math.round(pos.x), y: Math.round(pos.y) },
      order.target,
      ORDER_PATH_MAX_STEPS
    );
    if (route && route.length > 0) {
      path.waypoints = route;
      path.currentIndex = 0;
      return;
    }
    // No route (yet): edge toward the slot and try again when this step ends
    const step = this.fallbackMoveToward(pos, order.target);
    if (step) {
      path.waypoints = [step];
      path.currentIndex = 0;
    }
  }

  /** One pass over predators and surface food — every ant reads these arrays instead of re-querying */
  private buildTickSnapshots(): void {
    this.attackerByTarget = buildAttackerMap(this.world);
    this.undergroundFoodAvailable = this.computeUndergroundFood();

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
        ant.stateTimer = 0;
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

    // Check if we're near any food source (snapshot is surface-only already)
    for (const f of this.foodSnapshot) {
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
      if (carrying.amount > 0 && ant.role === AntRole.Worker) {
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

    // Check danger pheromone — follow multi-tile trail
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

  private handleGoingToDen(
    id: EntityId,
    ant: AntComponent,
    pos: PositionComponent,
    path: PathComponent
  ): void {
    // Must have a valid command target — soldiers only go to dens via manual dispatch
    if (!ant.commandTargetId || !this.world.hasEntity(ant.commandTargetId)) {
      ant.commandTargetId = null;
      ant.state = AntState.Searching;
      ant.stateTimer = 0;
      return;
    }

    const denId = ant.commandTargetId;

    const denPos = this.world.getComponent<PositionComponent>(denId, COMPONENT.POSITION);
    if (!denPos) {
      ant.commandTargetId = null;
      ant.state = AntState.Searching;
      ant.stateTimer = 0;
      return;
    }

    const dist = this.distance(pos, denPos);
    if (dist < SOLDIER_ATTACK_RANGE) {
      ant.state = AntState.AttackingDen;
      ant.stateTimer = 0;
      ensureCombatComponent(this.world, id, denId);
      path.waypoints = [];
      path.currentIndex = 0;
      return;
    }

    // Repath if needed
    if (path.currentIndex >= path.waypoints.length) {
      this.pathToEntity(pos, denId, path);
    }

    // Timeout — generous for large maps (120×90), soldiers must have time to cross it
    if (ant.stateTimer > 120) {
      ant.commandTargetId = null;
      ant.state = AntState.Searching;
      ant.stateTimer = 0;
    }
  }

  private handleAttackingDen(
    id: EntityId,
    ant: AntComponent,
    pos: PositionComponent,
    path: PathComponent
  ): void {
    const combat = this.world.getComponent<CombatComponent>(id, COMPONENT.COMBAT);
    if (!combat || combat.targetEntityId === null) {
      ant.commandTargetId = null;
      ant.state = AntState.Searching;
      ant.stateTimer = 0;
      return;
    }

    // Check target still exists (den destroyed)
    if (!this.world.hasEntity(combat.targetEntityId)) {
      combat.targetEntityId = null;
      ant.commandTargetId = null;
      ant.state = AntState.Searching;
      ant.stateTimer = 0;
      return;
    }

    // Check for nearby beetles — defend self first (but commanded soldiers are more focused)
    if (!ant.commandTargetId) {
      const nearbyBeetle = this.findNearestBeetle(pos);
      if (nearbyBeetle && nearbyBeetle.dist < SOLDIER_ATTACK_RANGE * 2) {
        combat.targetEntityId = null;
        ant.state = AntState.ChasingEnemy;
        ant.stateTimer = 0;
        this.pathToEntity(pos, nearbyBeetle.entityId, path);
        return;
      }
    }

    // Stay still while attacking den
    path.waypoints = [];
    path.currentIndex = 0;
  }

  private isHungry(id: EntityId): boolean {
    const hunger = this.world.getComponent<HungerComponent>(id, COMPONENT.HUNGER);
    return hunger !== undefined && hunger.current < hunger.max * HUNGER_EAT_THRESHOLD;
  }

  /** Hand a load to the nest's surface stockpile — worker porters haul it below */
  private dropAtStockpile(carrying: CarryingComponent): void {
    const nest = this.world.getComponent<NestComponent>(this.nestEntityId!, COMPONENT.NEST);
    if (!nest) return;
    nest.foodStored += carrying.amount;
    if (carrying.resourceType === 'mushroom') nest.mushroomStored += carrying.amount;
    else if (carrying.resourceType === 'meat') nest.meatStored += carrying.amount;
    carrying.amount = 0;
    carrying.resourceType = null;
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
   */
  private selectSoldierTarget(
    pos: PositionComponent,
    visionRange: number
  ): { entityId: EntityId; dist: number; x: number; y: number; score: number } | null {
    const selfNestDist = this.distToNest(pos);
    let best: { entityId: EntityId; dist: number; x: number; y: number; score: number } | null = null;

    for (const e of this.enemySnapshot) {
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

    // GATHER action
    const nearbyFood = this.findNearestFoodEntity(id, pos, ant);
    if (nearbyFood) {
      const score = ACTION_SCORE.FOOD_VISION_BONUS * roleWeights.food * priorityMult.food;
      candidates.push({ action: 'gather', score, targetId: nearbyFood.entityId });
    } else {
      const foodPhero = this.sampleFoodPheromone(pos, 3);
      if (foodPhero > 1.0) {
        const score = (foodPhero / PHEROMONE_MAX) * ACTION_SCORE.PHEROMONE_TRAIL_BONUS
                      * roleWeights.food * priorityMult.food;
        candidates.push({ action: 'gather', score });
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
