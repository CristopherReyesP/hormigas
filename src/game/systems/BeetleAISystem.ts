import type { System } from '../../engine/ecs/types';
import type { World } from '../../engine/ecs/World';
import type { TileGrid } from '../../simulation/world/TileGrid';
import type { EntityId, Vector2 } from '../../shared/types';
import {
  COMPONENT,
  BeetleState,
  FoodType,
  AntRole,
  type BeetleComponent,
  type PositionComponent,
  type PathComponent,
  type CombatComponent,
  type FoodSourceComponent,
  type AntComponent,
  type HealthComponent,
  type LayerComponent,
  Layer,
} from '../components/components';
import { findPath } from '../../simulation/pathfinding/AStar';
import type { GlobalModifiers } from '../events/GlobalModifiers';
import {
  BEETLE_STATS,
  DANGER_PHEROMONE_PASSIVE_STRENGTH,
  PHEROMONE_MAX,
  BEETLE_RETREAT_HEALTH_RATIO,
  BEETLE_RETREAT_DURATION,
  BEETLE_REGEN_RATE,
  BEETLE_CHASE_REPATH_INTERVAL,
  BEETLE_SWARM_RADIUS,
  BEETLE_SWARM_AVOIDANCE,
  BEETLE_SOLDIER_AVOIDANCE,
} from '../../shared/constants';

/** Surface ants visible to predators this tick — one snapshot shared by every beetle */
interface PreySnapshot {
  id: EntityId;
  x: number;
  y: number;
  isSoldier: boolean;
}

export class BeetleAISystem implements System {
  readonly name = 'BeetleAISystem';
  readonly priority = 6;

  private world: World;
  private grid: TileGrid;
  private modifiers: GlobalModifiers;

  /** Rebuilt once per tick — beetles used to run a full world.query EACH, EVERY frame */
  private prey: PreySnapshot[] = [];

  constructor(world: World, grid: TileGrid, modifiers: GlobalModifiers) {
    this.world = world;
    this.grid = grid;
    this.modifiers = modifiers;
  }

  /** Detection range, widened at night (GlobalModifiers.enemyAggressionMultiplier) */
  private get visionRange(): number {
    return BEETLE_STATS.visionRange * this.modifiers.enemyAggressionMultiplier;
  }

  update(dt: number): void {
    this.buildPreySnapshot();
    const beetles = this.world.query(COMPONENT.BEETLE, COMPONENT.POSITION, COMPONENT.PATH);

    for (const id of beetles) {
      // Underground invaders are driven by UndergroundInvasionSystem, not surface AI
      const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER);
      if (layer && layer.layer === Layer.Underground) continue;

      const beetle = this.world.getComponent<BeetleComponent>(id, COMPONENT.BEETLE)!;
      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      const path = this.world.getComponent<PathComponent>(id, COMPONENT.PATH)!;
      const combat = this.world.getComponent<CombatComponent>(id, COMPONENT.COMBAT)!;

      beetle.stateTimer += dt;
      if (beetle.repathTimer !== undefined) beetle.repathTimer -= dt;

      // All beetles emit passive danger pheromone
      const tile = this.grid.getTile(Math.round(pos.x), Math.round(pos.y));
      if (tile) {
        tile.dangerPheromone = Math.min(PHEROMONE_MAX, tile.dangerPheromone + DANGER_PHEROMONE_PASSIVE_STRENGTH);
      }

      // Self-preservation beats appetite: a beetle bleeding out disengages and
      // runs instead of feeding the colony free meat. Underground invaders never
      // get here (skipped above) — those are fanatics on purpose.
      if (
        beetle.state !== BeetleState.Retreating &&
        this.healthRatio(id) < BEETLE_RETREAT_HEALTH_RATIO
      ) {
        beetle.state = BeetleState.Retreating;
        beetle.stateTimer = 0;
        beetle.targetEntityId = null;
        combat.targetEntityId = null;
        path.waypoints = [];
        path.currentIndex = 0;
      }

      switch (beetle.state) {
        case BeetleState.Retreating:
          this.handleRetreating(id, beetle, pos, path, dt);
          break;

        case BeetleState.Roaming:
          this.handleRoaming(id, beetle, pos, path, combat);
          break;

        case BeetleState.ChasingFood:
          this.handleChasingFood(id, beetle, pos, path);
          break;

        case BeetleState.Eating:
          this.handleEating(id, beetle, pos, dt);
          break;

        case BeetleState.ChasingAnt:
          this.handleChasingAnt(id, beetle, pos, path, combat);
          break;

        case BeetleState.Attacking:
          this.handleAttacking(id, beetle, pos, combat);
          break;
      }
    }
  }

  private handleRoaming(
    id: EntityId,
    beetle: BeetleComponent,
    pos: PositionComponent,
    path: PathComponent,
    combat: CombatComponent
  ): void {
    // Priority 1: Look for nearby ants
    const nearbyAnt = this.findNearestAnt(pos, this.visionRange);
    if (nearbyAnt) {
      beetle.state = BeetleState.ChasingAnt;
      beetle.targetEntityId = nearbyAnt.id;
      beetle.stateTimer = 0;
      return;
    }

    // Priority 2: Look for nearby food
    const nearbyFood = this.findNearestFood(pos, this.visionRange);
    if (nearbyFood) {
      beetle.state = BeetleState.ChasingFood;
      beetle.targetEntityId = nearbyFood.id;
      beetle.stateTimer = 0;
      return;
    }

    // Random walk if no path or timeout
    if (path.waypoints.length === 0 || path.currentIndex >= path.waypoints.length || beetle.stateTimer > 5) {
      const target = this.getRandomWalkTarget(pos);
      if (target) {
        const currentPos = { x: Math.round(pos.x), y: Math.round(pos.y) };
        const newPath = findPath(this.grid, currentPos, target);
        if (newPath && newPath.length > 0) {
          path.waypoints = newPath;
          path.currentIndex = 0;
        } else {
          // Fallback: direct waypoint
          path.waypoints = [target];
          path.currentIndex = 0;
        }
      }
      beetle.stateTimer = 0;
    }

    void id;
    void combat;
  }

  private handleChasingFood(
    id: EntityId,
    beetle: BeetleComponent,
    pos: PositionComponent,
    path: PathComponent
  ): void {
    // Check if target food still exists
    if (beetle.targetEntityId === null || !this.world.hasEntity(beetle.targetEntityId)) {
      beetle.state = BeetleState.Roaming;
      beetle.targetEntityId = null;
      beetle.stateTimer = 0;
      return;
    }

    const foodPos = this.world.getComponent<PositionComponent>(beetle.targetEntityId, COMPONENT.POSITION);
    if (!foodPos) {
      beetle.state = BeetleState.Roaming;
      beetle.targetEntityId = null;
      beetle.stateTimer = 0;
      return;
    }

    const dist = this.distance(pos, foodPos);

    // Reached food — start eating
    if (dist < 1.5) {
      beetle.state = BeetleState.Eating;
      beetle.stateTimer = 0;
      path.waypoints = [];
      path.currentIndex = 0;
      return;
    }

    // Timeout — give up
    if (beetle.stateTimer > 10) {
      beetle.state = BeetleState.Roaming;
      beetle.targetEntityId = null;
      beetle.stateTimer = 0;
      return;
    }

    // Update path to food if needed
    if (path.waypoints.length === 0 || path.currentIndex >= path.waypoints.length) {
      const currentPos = { x: Math.round(pos.x), y: Math.round(pos.y) };
      const targetPos = { x: Math.round(foodPos.x), y: Math.round(foodPos.y) };
      const newPath = findPath(this.grid, currentPos, targetPos);
      if (newPath && newPath.length > 0) {
        path.waypoints = newPath;
        path.currentIndex = 0;
      }
    }

    void id;
  }

  private handleEating(
    id: EntityId,
    beetle: BeetleComponent,
    pos: PositionComponent,
    dt: number
  ): void {
    // Check if target food still exists
    if (beetle.targetEntityId === null || !this.world.hasEntity(beetle.targetEntityId)) {
      beetle.state = BeetleState.Roaming;
      beetle.targetEntityId = null;
      beetle.stateTimer = 0;
      return;
    }

    const food = this.world.getComponent<FoodSourceComponent>(beetle.targetEntityId, COMPONENT.FOOD_SOURCE);
    if (!food) {
      beetle.state = BeetleState.Roaming;
      beetle.targetEntityId = null;
      beetle.stateTimer = 0;
      return;
    }

    // Consume food over time
    const consumeRate = 20; // per second
    food.amount -= consumeRate * dt;

    // Food depleted
    if (food.amount <= 0) {
      this.world.destroyEntity(beetle.targetEntityId);
      beetle.state = BeetleState.Roaming;
      beetle.targetEntityId = null;
      beetle.stateTimer = 0;
      return;
    }

    // Timeout — stop eating
    if (beetle.stateTimer > 3) {
      beetle.state = BeetleState.Roaming;
      beetle.targetEntityId = null;
      beetle.stateTimer = 0;
      return;
    }

    void id;
    void pos;
  }

  private handleChasingAnt(
    id: EntityId,
    beetle: BeetleComponent,
    pos: PositionComponent,
    path: PathComponent,
    combat: CombatComponent
  ): void {
    // Check if target ant still exists
    if (beetle.targetEntityId === null || !this.world.hasEntity(beetle.targetEntityId)) {
      beetle.state = BeetleState.Roaming;
      beetle.targetEntityId = null;
      beetle.stateTimer = 0;
      return;
    }

    const antPos = this.world.getComponent<PositionComponent>(beetle.targetEntityId, COMPONENT.POSITION);
    if (!antPos) {
      beetle.state = BeetleState.Roaming;
      beetle.targetEntityId = null;
      beetle.stateTimer = 0;
      return;
    }

    const dist = this.distance(pos, antPos);

    // In attack range — start attacking
    if (dist < BEETLE_STATS.attackRange) {
      beetle.state = BeetleState.Attacking;
      combat.targetEntityId = beetle.targetEntityId;
      beetle.stateTimer = 0;
      path.waypoints = [];
      path.currentIndex = 0;
      return;
    }

    // Lost them — too far away
    if (dist > this.visionRange * 2) {
      beetle.state = BeetleState.Roaming;
      beetle.targetEntityId = null;
      beetle.stateTimer = 0;
      return;
    }

    // Timeout — give up chase
    if (beetle.stateTimer > 10) {
      beetle.state = BeetleState.Roaming;
      beetle.targetEntityId = null;
      beetle.stateTimer = 0;
      return;
    }

    // Re-aim periodically: ants MOVE. Repathing only when the path ran out meant
    // the beetle walked to where the ant stood seconds ago and lost every chase
    // against anything faster than itself (every scout, and every fleeing worker).
    const pathExhausted = path.waypoints.length === 0 || path.currentIndex >= path.waypoints.length;
    if (pathExhausted || beetle.repathTimer === undefined || beetle.repathTimer <= 0) {
      beetle.repathTimer = BEETLE_CHASE_REPATH_INTERVAL;
      const currentPos = { x: Math.round(pos.x), y: Math.round(pos.y) };
      const targetPos = { x: Math.round(antPos.x), y: Math.round(antPos.y) };
      const newPath = findPath(this.grid, currentPos, targetPos);
      if (newPath && newPath.length > 0) {
        path.waypoints = newPath;
        path.currentIndex = 0;
      }
    }

    void id;
  }

  /**
   * Wounded: run for the den (or simply away from the ants), regenerating.
   * The player now has a real decision — commit to the kill or let it come back.
   */
  private handleRetreating(
    id: EntityId,
    beetle: BeetleComponent,
    pos: PositionComponent,
    path: PathComponent,
    dt: number
  ): void {
    const health = this.world.getComponent<HealthComponent>(id, COMPONENT.HEALTH);
    if (health) {
      health.current = Math.min(health.max, health.current + BEETLE_REGEN_RATE * dt);
    }

    const recovered = !health || health.current >= health.max * 0.9;
    if (recovered || beetle.stateTimer > BEETLE_RETREAT_DURATION) {
      beetle.state = BeetleState.Roaming;
      beetle.stateTimer = 0;
      path.waypoints = [];
      path.currentIndex = 0;
      return;
    }

    if (path.waypoints.length > 0 && path.currentIndex < path.waypoints.length) return;

    // Home is the den; without one, just put distance between itself and the ants
    let target: Vector2 | null = null;
    if (beetle.denEntityId !== null && this.world.hasEntity(beetle.denEntityId)) {
      const denPos = this.world.getComponent<PositionComponent>(beetle.denEntityId, COMPONENT.POSITION);
      if (denPos) target = { x: Math.round(denPos.x), y: Math.round(denPos.y) };
    }
    if (!target) {
      const threat = this.findNearestAnt(pos, this.visionRange * 2);
      if (threat) {
        const dx = pos.x - threat.pos.x;
        const dy = pos.y - threat.pos.y;
        const len = Math.hypot(dx, dy) || 1;
        for (let d = 10; d >= 3; d -= 2) {
          const tx = Math.round(pos.x + (dx / len) * d);
          const ty = Math.round(pos.y + (dy / len) * d);
          if (this.grid.isWalkable(tx, ty)) {
            target = { x: tx, y: ty };
            break;
          }
        }
      }
    }
    if (!target) target = this.getRandomWalkTarget(pos);
    if (!target) return;

    const route = findPath(this.grid, { x: Math.round(pos.x), y: Math.round(pos.y) }, target);
    path.waypoints = route && route.length > 0 ? route : [target];
    path.currentIndex = 0;
  }

  private healthRatio(id: EntityId): number {
    const health = this.world.getComponent<HealthComponent>(id, COMPONENT.HEALTH);
    if (!health || health.max === 0) return 1;
    return health.current / health.max;
  }

  private handleAttacking(
    id: EntityId,
    beetle: BeetleComponent,
    pos: PositionComponent,
    combat: CombatComponent
  ): void {
    // Check if target still exists
    if (beetle.targetEntityId === null || !this.world.hasEntity(beetle.targetEntityId)) {
      beetle.state = BeetleState.Roaming;
      beetle.targetEntityId = null;
      combat.targetEntityId = null;
      beetle.stateTimer = 0;
      return;
    }

    const targetPos = this.world.getComponent<PositionComponent>(beetle.targetEntityId, COMPONENT.POSITION);
    if (!targetPos) {
      beetle.state = BeetleState.Roaming;
      beetle.targetEntityId = null;
      combat.targetEntityId = null;
      beetle.stateTimer = 0;
      return;
    }

    const dist = this.distance(pos, targetPos);

    // Target fled — resume chase
    if (dist > BEETLE_STATS.attackRange * 1.5) {
      beetle.state = BeetleState.ChasingAnt;
      combat.targetEntityId = null;
      beetle.stateTimer = 0;
      return;
    }

    // CombatSystem handles the actual damage
    void id;
  }

  /**
   * SURFACE ants only. Layers share coordinates, so an unfiltered query let a
   * beetle standing on the lawn lock onto a nurse two chambers underground —
   * it then walked to a spot where nothing was and CombatSystem (which does
   * check layers) refused the hit. The whole chase was a hallucination.
   */
  private buildPreySnapshot(): void {
    this.prey.length = 0;
    for (const antId of this.world.query(COMPONENT.ANT, COMPONENT.POSITION)) {
      const layer = this.world.getComponent<LayerComponent>(antId, COMPONENT.LAYER);
      if (layer && layer.layer !== Layer.Surface) continue;
      const antPos = this.world.getComponent<PositionComponent>(antId, COMPONENT.POSITION)!;
      const ant = this.world.getComponent<AntComponent>(antId, COMPONENT.ANT);
      this.prey.push({
        id: antId,
        x: antPos.x,
        y: antPos.y,
        isSoldier: ant !== undefined && ant.role === AntRole.Soldier,
      });
    }
  }

  /**
   * Picks prey by PERCEIVED cost, not raw distance: an ant surrounded by its
   * sisters is a losing fight (ants get a flanking damage bonus for swarming),
   * so a lone forager two tiles further away is the smarter meal.
   */
  private findNearestAnt(pos: PositionComponent, visionRange: number): { id: EntityId; pos: PositionComponent } | null {
    let bestId: EntityId | null = null;
    let bestPos: { x: number; y: number } | null = null;
    let bestScore = Infinity;

    for (const candidate of this.prey) {
      const dist = Math.hypot(candidate.x - pos.x, candidate.y - pos.y);
      if (dist >= visionRange) continue;

      // How much backup does this ant have within biting distance?
      let escorts = 0;
      for (const other of this.prey) {
        if (other.id === candidate.id) continue;
        if (Math.hypot(other.x - candidate.x, other.y - candidate.y) < BEETLE_SWARM_RADIUS) escorts++;
      }

      const score =
        dist *
        (candidate.isSoldier ? BEETLE_SOLDIER_AVOIDANCE : 1.0) *
        (1 + BEETLE_SWARM_AVOIDANCE * escorts);

      if (score < bestScore) {
        bestScore = score;
        bestId = candidate.id;
        bestPos = { x: candidate.x, y: candidate.y };
      }
    }

    if (bestId === null || !bestPos) return null;
    const livePos = this.world.getComponent<PositionComponent>(bestId, COMPONENT.POSITION);
    return livePos ? { id: bestId, pos: livePos } : null;
  }

  private findNearestFood(pos: PositionComponent, visionRange: number): { id: EntityId; pos: PositionComponent } | null {
    const foods = this.world.query(COMPONENT.FOOD_SOURCE, COMPONENT.POSITION);
    let nearest: { id: EntityId; pos: PositionComponent } | null = null;
    let nearestDist = Infinity;

    for (const foodId of foods) {
      const food = this.world.getComponent<FoodSourceComponent>(foodId, COMPONENT.FOOD_SOURCE);
      if (!food) continue;

      // No cannibalism — skip beetle meat
      if (food.resourceType === FoodType.BeetleMeat) continue;

      // Surface beetles must not smell underground drops (layers share coordinates)
      const foodLayer = this.world.getComponent<LayerComponent>(foodId, COMPONENT.LAYER);
      if (foodLayer && foodLayer.layer !== Layer.Surface) continue;

      const foodPos = this.world.getComponent<PositionComponent>(foodId, COMPONENT.POSITION)!;
      const dist = this.distance(pos, foodPos);

      if (dist < visionRange && dist < nearestDist) {
        nearestDist = dist;
        nearest = { id: foodId, pos: foodPos };
      }
    }

    return nearest;
  }

  private getRandomWalkTarget(pos: PositionComponent): Vector2 | null {
    const angle = Math.random() * Math.PI * 2;
    const dist = 3 + Math.random() * 7; // 3-10 tiles
    const tx = Math.round(pos.x + Math.cos(angle) * dist);
    const ty = Math.round(pos.y + Math.sin(angle) * dist);

    if (this.grid.isWalkable(tx, ty)) {
      return { x: tx, y: ty };
    }
    return null;
  }

  private distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}
