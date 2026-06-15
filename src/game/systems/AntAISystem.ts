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
  type NestComponent,
  type RoleStatsComponent,
  type CombatComponent,
  type HealthComponent,
  type HungerComponent,
  type LayerComponent,
} from '../components/components';
import type { VisibilityGrid } from '../../simulation/world/VisibilityGrid';
import { findPath } from '../../simulation/pathfinding/AStar';
import { buildAttackerMap, ensureCombatComponent } from './helpers/combatHelpers';
import type { UndergroundGrid, PantryFoodType } from '../../simulation/world/UndergroundGrid';
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
  WORKER_FIGHT_RANGE,
  HEAL_HEALTH_THRESHOLD,
  HEAL_NEST_RANGE,
  SOLDIER_DANGER_CHASE_THRESHOLD,
  HUNGER_EAT_THRESHOLD,
  HUNGER_PER_FOOD,
  GIANT_MUSHROOM_NUTRITION_MULTIPLIER,
  HUNGER_EAT_RATE,
  ROLE_BASE_WEIGHTS,
  COLONY_PRIORITY_MULTIPLIERS,
  TILE_SCORE,
  ACTION_SCORE,
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

    const ants = this.world.query(COMPONENT.ANT, COMPONENT.POSITION, COMPONENT.PATH, COMPONENT.CARRYING);

    for (const id of ants) {
      // Skip underground entities — handled by NurseAISystem / ExcavationSystem
      const layerComp = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER);
      if (layerComp && layerComp.layer === Layer.Underground) continue;

      const ant = this.world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      const path = this.world.getComponent<PathComponent>(id, COMPONENT.PATH)!;
      const carrying = this.world.getComponent<CarryingComponent>(id, COMPONENT.CARRYING)!;

      ant.stateTimer += dt;

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

        case AntState.Depositing:
          this.handleDepositing(id, ant, pos, carrying);
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
          this.handleHealing(id, ant, pos, path, dt);
          break;
      }

      // Auto-feed: any ant near nest eats to restore hunger
      if (nestDistPhero < HEAL_NEST_RANGE) {
        this.feedAtNest(id, dt);
      }
    }
  }

  /** One pass over predators and surface food — every ant reads these arrays instead of re-querying */
  private buildTickSnapshots(): void {
    this.attackerByTarget = buildAttackerMap(this.world);

    this.enemySnapshot.length = 0;
    for (const store of [COMPONENT.BEETLE, COMPONENT.CRICKET]) {
      for (const id of this.world.query(store, COMPONENT.POSITION)) {
        const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
        this.enemySnapshot.push({ id, x: pos.x, y: pos.y });
      }
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

  private feedAtNest(id: EntityId, dt: number): void {
    const hunger = this.world.getComponent<HungerComponent>(id, COMPONENT.HUNGER);
    if (!hunger || hunger.current >= hunger.max) return;
    if (this.nestEntityId === null) return;

    const nest = this.world.getComponent<NestComponent>(this.nestEntityId, COMPONENT.NEST);
    if (!nest || nest.foodStored < 0.01) return;

    // Eat: consume food from nest, restore hunger
    const hungerMissing = hunger.max - hunger.current;
    const foodNeeded = hungerMissing / HUNGER_PER_FOOD;
    const foodToEat = Math.min(foodNeeded, nest.foodStored, HUNGER_EAT_RATE * dt);

    hunger.current += foodToEat * HUNGER_PER_FOOD;
    if (hunger.current > hunger.max) hunger.current = hunger.max;

    this.consumeFromNestStores(nest, foodToEat);
  }

  /**
   * Deduct from the surface nest stores following the colony's consumption
   * policy (leaf is the implicit remainder of foodStored, so "eating leaf"
   * only shrinks the total). Falls back to leaf-first if no policy source.
   */
  private consumeFromNestStores(nest: NestComponent, amount: number): void {
    const available: Record<PantryFoodType, number> = {
      leaf: Math.max(0, nest.foodStored - nest.mushroomStored - nest.meatStored),
      mushroom: nest.mushroomStored,
      meat: nest.meatStored,
    };
    nest.foodStored = Math.max(0, nest.foodStored - amount);

    const order: PantryFoodType[] = this.undergroundGrid
      ? this.undergroundGrid.getConsumptionOrder()
      : ['leaf', 'mushroom', 'meat'];

    let remaining = amount;
    for (const type of order) {
      if (remaining <= 1e-9) break;
      const eaten = Math.min(remaining, available[type]);
      remaining -= eaten;
      if (type === 'mushroom') nest.mushroomStored -= eaten;
      else if (type === 'meat') nest.meatStored = Math.max(0, nest.meatStored - eaten);
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
          const health = this.world.getComponent<HealthComponent>(id, COMPONENT.HEALTH);
          if (health && health.current / health.max < SCOUT_FLEE_HEALTH_RATIO) {
            // Hurt scout flees
            this.emitDangerPheromone(pos, DANGER_PHEROMONE_EMIT_STRENGTH);
            ant.state = AntState.Fleeing;
            ant.stateTimer = 0;
            this.pathAwayFrom(pos, { x: attackerPos.x, y: attackerPos.y }, path);
            return;
          } else {
            // Healthy scout fights back
            ant.state = AntState.AttackingEnemy;
            ant.stateTimer = 0;
            path.waypoints = [];
            path.currentIndex = 0;
            ensureCombatComponent(this.world, id, attackerId);
            return;
          }
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

    // === Health check: hurt ants go heal at nest ===
    // stateTimer < 0 = grace period after failed healing (no food) — let ant search first
    if (ant.stateTimer > 0) {
      const healthCheck = this.world.getComponent<HealthComponent>(id, COMPONENT.HEALTH);
      if (healthCheck && healthCheck.current < healthCheck.max * HEAL_HEALTH_THRESHOLD) {
        ant.state = AntState.ReturningHome;
        ant.stateTimer = 0;
        this.pathToNest(pos, path);
        return;
      }
    }

    // === Hunger check: starving ants go eat at nest ===
    if (ant.stateTimer > 0) {
      const hungerCheck = this.world.getComponent<HungerComponent>(id, COMPONENT.HUNGER);
      if (hungerCheck && hungerCheck.current < hungerCheck.max * HUNGER_EAT_THRESHOLD) {
        ant.state = AntState.ReturningHome;
        ant.stateTimer = 0;
        this.pathToNest(pos, path);
        return;
      }
    }

    // === Beetle detection (all roles) ===
    const nearbyBeetle = this.findNearestBeetle(pos);

    if (ant.role === AntRole.Scout && nearbyBeetle) {
      const roleStats = this.world.getComponent<RoleStatsComponent>(id, COMPONENT.ROLE_STATS);
      const scoutVision = roleStats ? roleStats.visionRange : 18;
      if (nearbyBeetle.dist < scoutVision) {
        const health = this.world.getComponent<HealthComponent>(id, COMPONENT.HEALTH);
        if (health && health.current / health.max < SCOUT_FLEE_HEALTH_RATIO) {
          // Scout is hurt — flee and emit danger pheromone
          this.emitDangerPheromone(pos, DANGER_PHEROMONE_EMIT_STRENGTH);
          ant.state = AntState.Fleeing;
          ant.stateTimer = 0;
          this.pathAwayFrom(pos, nearbyBeetle, path);
          return;
        } else if (nearbyBeetle.dist < SOLDIER_ATTACK_RANGE) {
          // Scout fights back when beetle is in melee range and scout isn't hurt
          ant.state = AntState.AttackingEnemy;
          ant.stateTimer = 0;
          path.waypoints = [];
          path.currentIndex = 0;
          ensureCombatComponent(this.world, id, nearbyBeetle.entityId);
          return;
        }
        // Scout is healthy and beetle not in melee — just keep doing scout things (ignore beetle)
      }
    }

    if (ant.role === AntRole.Soldier) {
      // Priority 1: Beetle in direct vision
      const roleStats = this.world.getComponent<RoleStatsComponent>(id, COMPONENT.ROLE_STATS);
      const soldierVision = roleStats ? roleStats.visionRange : 8;

      if (nearbyBeetle && nearbyBeetle.dist < soldierVision) {
        ant.state = AntState.ChasingEnemy;
        ant.stateTimer = 0;
        // Store beetle ID for tracking — use path to approach
        this.pathToEntity(pos, nearbyBeetle.entityId, path);
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
      if (carrying.amount > 0) {
        // FOOD IS ONLY STORED UNDERGROUND: the load is already in stored units
        // (converted at harvest) — carry it down to the pantry. PorterSystem's
        // Hauling drives the rest; if the pantry is full the ant holds the food.
        ant.state = AntState.Hauling;
        ant.stateTimer = 0;
        if (this.transitSystem) this.transitSystem.requestTransit(_id, 'enter');
      } else {
        // Arrived at nest without food — here to heal
        ant.state = AntState.Healing;
        ant.stateTimer = 0;
      }
      return;
    }

    // Stuck timeout: if returning home for too long, drop food and search again
    if (ant.stateTimer > 15) {
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

  private handleDepositing(
    id: EntityId,
    ant: AntComponent,
    _pos: PositionComponent,
    carrying: CarryingComponent
  ): void {
    if (!this.hasNest()) return;

    const nest = this.world.getComponent<NestComponent>(this.nestEntityId!, COMPONENT.NEST);
    if (nest && carrying.amount > 0) {
      const nutritionMultiplier =
        carrying.resourceType === FoodType.GiantMushroom ? GIANT_MUSHROOM_NUTRITION_MULTIPLIER :
        carrying.resourceType === FoodType.BeetleMeat ? BEETLE_MEAT_NUTRITION_MULTIPLIER :
        carrying.resourceType === FoodType.CricketMeat ? CRICKET_MEAT_NUTRITION_MULTIPLIER :
        carrying.resourceType === FoodType.Mushroom ? MUSHROOM_NUTRITION_MULTIPLIER : 1.0;
      const depositAmount = carrying.amount * nutritionMultiplier;
      nest.foodStored += depositAmount;
      if (carrying.resourceType === FoodType.BeetleMeat || carrying.resourceType === FoodType.CricketMeat) {
        nest.meatStored += depositAmount;
      } else if (carrying.resourceType === FoodType.Mushroom || carrying.resourceType === FoodType.GiantMushroom) {
        nest.mushroomStored += depositAmount;
      }
      carrying.amount = 0;
      carrying.resourceType = null;
    }

    // Check if significantly hurt — stay at nest to heal
    const health = this.world.getComponent<HealthComponent>(id, COMPONENT.HEALTH);
    if (health && health.current < health.max * HEAL_HEALTH_THRESHOLD) {
      ant.state = AntState.Healing;
      ant.stateTimer = 0;
      return;
    }

    // Go search again
    ant.state = AntState.Searching;
    ant.stateTimer = 0;
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
    const nearbyBeetle = this.findNearestBeetle(pos);

    // Beetle visible and in chase range → actively pursue
    if (nearbyBeetle && nearbyBeetle.dist <= SOLDIER_CHASE_RANGE) {
      // In attack range → switch to attacking
      if (nearbyBeetle.dist < SOLDIER_ATTACK_RANGE) {
        ant.state = AntState.AttackingEnemy;
        ant.stateTimer = 0;
        path.waypoints = [];
        path.currentIndex = 0;
        ensureCombatComponent(this.world, id, nearbyBeetle.entityId);
        return;
      }

      // Repath to beetle periodically
      if (path.currentIndex >= path.waypoints.length || ant.stateTimer > 2) {
        this.pathToEntity(pos, nearbyBeetle.entityId, path);
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
      const health = this.world.getComponent<HealthComponent>(id, COMPONENT.HEALTH);
      if (health && health.current / health.max < SCOUT_FLEE_HEALTH_RATIO) {
        // Scout is hurt — flee!
        this.emitDangerPheromone(pos, DANGER_PHEROMONE_EMIT_STRENGTH);
        ant.state = AntState.Fleeing;
        ant.stateTimer = 0;
        this.pathAwayFrom(pos, targetPos, path);
        combat.targetEntityId = null;
        return;
      }
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
    // Check for nearby beetles while patrolling
    const nearbyBeetle = this.findNearestBeetle(pos);
    const roleStats = this.world.getComponent<RoleStatsComponent>(id, COMPONENT.ROLE_STATS);
    const vision = roleStats ? roleStats.visionRange : 8;

    if (nearbyBeetle && nearbyBeetle.dist < vision) {
      ant.state = AntState.ChasingEnemy;
      ant.stateTimer = 0;
      this.pathToEntity(pos, nearbyBeetle.entityId, path);
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

    // Health check: hurt soldiers go heal
    const patrolHealth = this.world.getComponent<HealthComponent>(id, COMPONENT.HEALTH);
    if (patrolHealth && patrolHealth.current < patrolHealth.max * HEAL_HEALTH_THRESHOLD) {
      ant.state = AntState.ReturningHome;
      ant.stateTimer = 0;
      this.pathToNest(pos, path);
      return;
    }

    // Hunger check: starving soldiers break patrol to go eat — this was missing
    // and patrolling soldiers starved to death next to an empty surface stockpile
    const patrolHunger = this.world.getComponent<HungerComponent>(id, COMPONENT.HUNGER);
    if (patrolHunger && patrolHunger.current < patrolHunger.max * HUNGER_EAT_THRESHOLD) {
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

  private handleHealing(
    id: EntityId,
    ant: AntComponent,
    pos: PositionComponent,
    path: PathComponent,
    dt: number
  ): void {
    // Priority: if attacked, stop healing and react
    const attackerId = this.attackerByTarget.get(id) ?? null;
    if (attackerId !== null) {
      const attackerPos = this.world.getComponent<PositionComponent>(attackerId, COMPONENT.POSITION);
      if (attackerPos) {
        if (ant.role === AntRole.Scout) {
          const health = this.world.getComponent<HealthComponent>(id, COMPONENT.HEALTH);
          if (health && health.current / health.max < SCOUT_FLEE_HEALTH_RATIO) {
            this.emitDangerPheromone(pos, DANGER_PHEROMONE_EMIT_STRENGTH);
            ant.state = AntState.Fleeing;
            ant.stateTimer = 0;
            this.pathAwayFrom(pos, { x: attackerPos.x, y: attackerPos.y }, path);
            return;
          }
        }
        // All roles fight back when attacked while healing
        ant.state = AntState.AttackingEnemy;
        ant.stateTimer = 0;
        path.waypoints = [];
        path.currentIndex = 0;
        ensureCombatComponent(this.world, id, attackerId);
        return;
      }
    }

    // Must be near nest — walk there first
    const nestDist = this.distToNest(pos);
    if (nestDist > HEAL_NEST_RANGE) {
      if (path.waypoints.length === 0 || path.currentIndex >= path.waypoints.length) {
        this.pathToNest(pos, path);
      }
      return;
    }

    // At nest — stay still while healing
    path.waypoints = [];
    path.currentIndex = 0;

    const health = this.world.getComponent<HealthComponent>(id, COMPONENT.HEALTH);
    if (!health || !this.hasNest()) {
      ant.state = AntState.Searching;
      ant.stateTimer = 0;
      return;
    }

    // Fully healed and fed — back to work
    if (health.current >= health.max) {
      const hunger = this.world.getComponent<HungerComponent>(id, COMPONENT.HUNGER);
      const wellFed = !hunger || hunger.current >= hunger.max * 0.9;
      if (wellFed) {
        ant.state = AntState.Searching;
        ant.stateTimer = 0;
        return;
      }
    }

    // HEALING HAPPENS INSIDE THE NEST, ALWAYS: food only lives underground
    // (pantry piles, farm mushrooms, or loose invader meat). Ride the shaft
    // down — UndergroundHealingSystem takes over from there (state stays Healing).
    if (this.transitSystem && this.undergroundGrid && this.hasUndergroundFood()) {
      this.transitSystem.requestTransit(id, 'enter');
      return;
    }

    // Truly nothing edible below — wait briefly, then go forage yourself
    if (ant.stateTimer > 5) {
      // Negative stateTimer = grace period before health check sends us back
      ant.state = AntState.Searching;
      ant.stateTimer = -3;
    }
    void dt;
  }

  /** Anything edible below? Pantry/farm piles or loose drops (invader meat) */
  private hasUndergroundFood(): boolean {
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

    for (const f of this.foodSnapshot) {
      const dx = f.x - pos.x;
      const dy = f.y - pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // Only "see" food within vision range
      if (dist >= visionRange) continue;

      // Mushrooms are "perceived" as closer (more desirable)
      const effectiveDist = f.type === FoodType.Mushroom ? dist * MUSHROOM_PREFERENCE_MULTIPLIER : dist;

      if (effectiveDist < nearestDist) {
        nearestDist = effectiveDist;
        nearest = { entityId: f.id, dist, foodType: f.type };
      }
    }

    // Suppress unused var warning
    void ant;

    return nearest;
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
    } else {
      if (tile.dangerPheromone > 5) {
        score -= (tile.dangerPheromone / PHEROMONE_MAX) * 0.3;
      }
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
      const nearbyBeetle = this.findNearestBeetle(pos);
      if (nearbyBeetle && nearbyBeetle.dist < visionRange) {
        const score = ACTION_SCORE.DANGER_NEARBY_BONUS * roleWeights.danger * priorityMult.danger;
        candidates.push({ action: 'chase', score, targetId: nearbyBeetle.entityId });
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
