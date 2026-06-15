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
  type LayerComponent,
  Layer,
} from '../components/components';
import { findPath } from '../../simulation/pathfinding/AStar';
import { BEETLE_STATS, DANGER_PHEROMONE_PASSIVE_STRENGTH, PHEROMONE_MAX } from '../../shared/constants';

export class BeetleAISystem implements System {
  readonly name = 'BeetleAISystem';
  readonly priority = 6;

  private world: World;
  private grid: TileGrid;

  constructor(world: World, grid: TileGrid) {
    this.world = world;
    this.grid = grid;
  }

  update(dt: number): void {
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

      // All beetles emit passive danger pheromone
      const tile = this.grid.getTile(Math.round(pos.x), Math.round(pos.y));
      if (tile) {
        tile.dangerPheromone = Math.min(PHEROMONE_MAX, tile.dangerPheromone + DANGER_PHEROMONE_PASSIVE_STRENGTH);
      }

      switch (beetle.state) {
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
    const nearbyAnt = this.findNearestAnt(pos, BEETLE_STATS.visionRange);
    if (nearbyAnt) {
      beetle.state = BeetleState.ChasingAnt;
      beetle.targetEntityId = nearbyAnt.id;
      beetle.stateTimer = 0;
      return;
    }

    // Priority 2: Look for nearby food
    const nearbyFood = this.findNearestFood(pos, BEETLE_STATS.visionRange);
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
    if (dist > BEETLE_STATS.visionRange * 2) {
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

    // Update path to ant
    if (path.waypoints.length === 0 || path.currentIndex >= path.waypoints.length) {
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

  private findNearestAnt(pos: PositionComponent, visionRange: number): { id: EntityId; pos: PositionComponent } | null {
    const ants = this.world.query(COMPONENT.ANT, COMPONENT.POSITION);
    let nearest: { id: EntityId; pos: PositionComponent } | null = null;
    let nearestDist = Infinity;

    for (const antId of ants) {
      const antPos = this.world.getComponent<PositionComponent>(antId, COMPONENT.POSITION)!;
      const dist = this.distance(pos, antPos);

      if (dist >= visionRange) continue;

      // Prefer workers and scouts over soldiers
      const ant = this.world.getComponent<AntComponent>(antId, COMPONENT.ANT);
      const preference = ant && ant.role === AntRole.Soldier ? 1.2 : 1.0;
      const effectiveDist = dist * preference;

      if (effectiveDist < nearestDist) {
        nearestDist = effectiveDist;
        nearest = { id: antId, pos: antPos };
      }
    }

    return nearest;
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
