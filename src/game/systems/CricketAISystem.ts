import type { System } from '../../engine/ecs/types';
import type { World } from '../../engine/ecs/World';
import type { TileGrid } from '../../simulation/world/TileGrid';
import type { EntityId } from '../../shared/types';
import {
  COMPONENT,
  CricketState,
  type CricketComponent,
  type PositionComponent,
  type PathComponent,
  type NestComponent,
  type CombatComponent,
  type HealthComponent,
  type CricketDenComponent,
} from '../components/components';
import { findPath } from '../../simulation/pathfinding/AStar';
import {
  CRICKET_STATS,
  CRICKET_STEAL_AMOUNT,
  DANGER_PHEROMONE_PASSIVE_STRENGTH,
  PHEROMONE_MAX,
} from '../../shared/constants';

export class CricketAISystem implements System {
  readonly name = 'CricketAISystem';
  readonly priority = 6;

  private cachedNestId: EntityId | null = null;

  private world: World;
  private grid: TileGrid;

  constructor(world: World, grid: TileGrid) {
    this.world = world;
    this.grid = grid;
  }

  update(dt: number): void {
    const crickets = this.world.query(COMPONENT.CRICKET, COMPONENT.POSITION, COMPONENT.PATH);

    for (const id of crickets) {
      const cricket = this.world.getComponent<CricketComponent>(id, COMPONENT.CRICKET)!;
      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      const path = this.world.getComponent<PathComponent>(id, COMPONENT.PATH)!;

      cricket.stateTimer += dt;

      // All crickets emit passive danger pheromone
      const tile = this.grid.getTile(Math.round(pos.x), Math.round(pos.y));
      if (tile) {
        tile.dangerPheromone = Math.min(PHEROMONE_MAX, tile.dangerPheromone + DANGER_PHEROMONE_PASSIVE_STRENGTH);
      }

      switch (cricket.state) {
        case CricketState.GoingToNest:
          this.handleGoingToNest(id, cricket, pos, path);
          break;

        case CricketState.StealingFood:
          this.handleStealingFood(id, cricket, pos, path, dt);
          break;

        case CricketState.Retreating:
          this.handleRetreating(id, cricket, pos, path);
          break;

        case CricketState.Attacking:
          this.handleAttacking(id, cricket, pos, path);
          break;
      }
    }
  }

  private handleGoingToNest(
    id: EntityId,
    cricket: CricketComponent,
    pos: PositionComponent,
    path: PathComponent
  ): void {
    const nestId = this.getNestEntity();
    if (nestId === null) return;

    const nestPos = this.world.getComponent<PositionComponent>(nestId, COMPONENT.POSITION);
    if (!nestPos) return;

    const healthRatio = this.getHealthRatio(id);

    // HP > 50%: priority is the NEST — ignore ants, tank through
    // HP <= 50%: defensive mode — fight nearby ants
    if (healthRatio <= 0.5) {
      const nearbyAnt = this.findNearestAnt(pos, CRICKET_STATS.visionRange);
      if (nearbyAnt) {
        cricket.previousState = CricketState.GoingToNest;
        cricket.state = CricketState.Attacking;
        cricket.targetEntityId = nearbyAnt.entityId;
        cricket.stateTimer = 0;

        const combat = this.world.getComponent<CombatComponent>(id, COMPONENT.COMBAT);
        if (combat) {
          combat.targetEntityId = nearbyAnt.entityId;
        }
        return;
      }
    }

    const dist = this.distance(pos, nestPos);

    // Reached nest — start stealing
    if (dist < 2.5) {
      cricket.state = CricketState.StealingFood;
      cricket.stateTimer = 0;
      path.waypoints = [];
      path.currentIndex = 0;
      this.world.pushNotification('danger', '🦗 ¡Un grillo está robando comida del nido!', 'cricket-steal', 10000);
      return;
    }

    // Repath every 3 seconds
    if (cricket.stateTimer > 3 || path.waypoints.length === 0 || path.currentIndex >= path.waypoints.length) {
      const currentPos = { x: Math.round(pos.x), y: Math.round(pos.y) };
      const targetPos = { x: Math.round(nestPos.x), y: Math.round(nestPos.y) };
      const newPath = findPath(this.grid, currentPos, targetPos);
      if (newPath && newPath.length > 0) {
        path.waypoints = newPath;
        path.currentIndex = 0;
      }
      if (cricket.stateTimer > 3) {
        cricket.stateTimer = 0;
      }
    }
  }

  private handleStealingFood(
    id: EntityId,
    cricket: CricketComponent,
    pos: PositionComponent,
    path: PathComponent,
    dt: number
  ): void {
    // Stay still — parked at the nest, draining food
    path.waypoints = [];
    path.currentIndex = 0;

    const healthRatio = this.getHealthRatio(id);

    // HP <= 25%: survival instinct — flee
    if (healthRatio <= 0.25) {
      cricket.state = CricketState.Retreating;
      cricket.stateTimer = 0;
      return;
    }

    // HP <= 50%: STOP stealing, proactively fight nearby ants
    if (healthRatio <= 0.5) {
      const nearbyAnt = this.findNearestAnt(pos, CRICKET_STATS.visionRange);
      if (nearbyAnt) {
        cricket.previousState = CricketState.StealingFood;
        cricket.state = CricketState.Attacking;
        cricket.targetEntityId = nearbyAnt.entityId;
        cricket.stateTimer = 0;

        const combat = this.world.getComponent<CombatComponent>(id, COMPONENT.COMBAT);
        if (combat) {
          combat.targetEntityId = nearbyAnt.entityId;
        }
        return;
      }
    }

    // Find the nest to steal from
    const nestId = this.getNestEntity();
    if (nestId === null) {
      cricket.state = CricketState.Retreating;
      cricket.stateTimer = 0;
      return;
    }

    const nest = this.world.getComponent<NestComponent>(nestId, COMPONENT.NEST);
    if (!nest || nest.foodStored <= 0) {
      // Nest emptied — retreat, job done
      cricket.state = CricketState.Retreating;
      cricket.stateTimer = 0;
      return;
    }

    // Steal food CONTINUOUSLY — no timeout, drains until killed or nest empty
    const stealRate = CRICKET_STEAL_AMOUNT * dt;
    const actualSteal = Math.min(stealRate, nest.foodStored);

    if (actualSteal > 0) {
      const totalStored = nest.foodStored;
      const mushroomRatio = nest.mushroomStored / totalStored;
      const meatRatio = nest.meatStored / totalStored;

      nest.mushroomStored = Math.max(0, nest.mushroomStored - actualSteal * mushroomRatio);
      nest.meatStored = Math.max(0, nest.meatStored - actualSteal * meatRatio);
      nest.foodStored = Math.max(0, nest.foodStored - actualSteal);

      cricket.stolenFood += actualSteal;
    }

    void pos;
  }

  private handleRetreating(
    id: EntityId,
    cricket: CricketComponent,
    pos: PositionComponent,
    path: PathComponent
  ): void {
    const healthRatio = this.getHealthRatio(id);

    // HP > 50%: keep retreating, don't stop for ants
    // HP <= 50%: defensive — fight ants in wider range
    if (healthRatio <= 0.5) {
      const detectRange = CRICKET_STATS.visionRange;
      const nearbyAnt = this.findNearestAnt(pos, detectRange);
      if (nearbyAnt) {
        cricket.previousState = CricketState.Retreating;
        cricket.state = CricketState.Attacking;
        cricket.targetEntityId = nearbyAnt.entityId;
        cricket.stateTimer = 0;

        const combat = this.world.getComponent<CombatComponent>(id, COMPONENT.COMBAT);
        if (combat) {
          combat.targetEntityId = nearbyAnt.entityId;
        }
        return;
      }
    }

    // Determine retreat target: den or map edge
    let retreatTarget: { x: number; y: number } | null = null;

    if (cricket.denEntityId !== null && this.world.hasEntity(cricket.denEntityId)) {
      const denPos = this.world.getComponent<PositionComponent>(cricket.denEntityId, COMPONENT.POSITION);
      if (denPos) {
        const distToDen = this.distance(pos, denPos);

        // Reached den — remove cricket and destroy entity
        if (distToDen < 1.5) {
          const den = this.world.getComponent<CricketDenComponent>(cricket.denEntityId, COMPONENT.CRICKET_DEN);
          if (den) {
            den.activeCrickets = Math.max(0, den.activeCrickets - 1);
          }
          this.world.destroyEntity(id);
          return;
        }

        retreatTarget = { x: Math.round(denPos.x), y: Math.round(denPos.y) };
      }
    }

    // No den — path to nearest map edge
    if (!retreatTarget) {
      retreatTarget = this.getNearestEdge(pos);
    }

    // Check if at map edge — destroy
    if (pos.x < 1 || pos.x > this.grid.width - 2 || pos.y < 1 || pos.y > this.grid.height - 2) {
      // Decrement den active count if den still exists
      if (cricket.denEntityId !== null && this.world.hasEntity(cricket.denEntityId)) {
        const den = this.world.getComponent<CricketDenComponent>(cricket.denEntityId, COMPONENT.CRICKET_DEN);
        if (den) {
          den.activeCrickets = Math.max(0, den.activeCrickets - 1);
        }
      }
      this.world.destroyEntity(id);
      return;
    }

    // Repath every 3 seconds
    if (retreatTarget && (cricket.stateTimer > 3 || path.waypoints.length === 0 || path.currentIndex >= path.waypoints.length)) {
      const currentPos = { x: Math.round(pos.x), y: Math.round(pos.y) };
      const newPath = findPath(this.grid, currentPos, retreatTarget);
      if (newPath && newPath.length > 0) {
        path.waypoints = newPath;
        path.currentIndex = 0;
      } else {
        // Fallback: direct waypoint
        path.waypoints = [retreatTarget];
        path.currentIndex = 0;
      }
      if (cricket.stateTimer > 3) {
        cricket.stateTimer = 0;
      }
    }
  }

  private handleAttacking(
    id: EntityId,
    cricket: CricketComponent,
    pos: PositionComponent,
    path: PathComponent
  ): void {
    const combat = this.world.getComponent<CombatComponent>(id, COMPONENT.COMBAT);
    if (!combat) {
      cricket.state = cricket.previousState;
      cricket.stateTimer = 0;
      return;
    }

    const healthRatio = this.getHealthRatio(id);
    // HP <= 50%: defensive mode — longer combat timeout, wider chase range
    const combatTimeout = healthRatio <= 0.5 ? 12 : 5;
    const disengageMultiplier = healthRatio <= 0.5 ? 3 : 2;

    // No target — find nearest ant
    if (cricket.targetEntityId === null) {
      const searchRange = healthRatio <= 0.5 ? CRICKET_STATS.visionRange * 1.5 : CRICKET_STATS.visionRange;
      const nearbyAnt = this.findNearestAnt(pos, searchRange);
      if (nearbyAnt) {
        cricket.targetEntityId = nearbyAnt.entityId;
        combat.targetEntityId = nearbyAnt.entityId;
      } else {
        // No ants around — return to previous state
        cricket.state = cricket.previousState;
        cricket.targetEntityId = null;
        combat.targetEntityId = null;
        cricket.stateTimer = 0;
        return;
      }
    }

    // Check if target still exists and is alive
    if (!this.world.hasEntity(cricket.targetEntityId!)) {
      // When wounded, immediately look for next target
      if (healthRatio <= 0.5) {
        const nextTarget = this.findNearestAnt(pos, CRICKET_STATS.visionRange * 1.5);
        if (nextTarget) {
          cricket.targetEntityId = nextTarget.entityId;
          combat.targetEntityId = nextTarget.entityId;
          cricket.stateTimer = 0;
          return;
        }
      }
      cricket.state = cricket.previousState;
      cricket.targetEntityId = null;
      combat.targetEntityId = null;
      cricket.stateTimer = 0;
      return;
    }

    const targetHealth = this.world.getComponent<HealthComponent>(cricket.targetEntityId!, COMPONENT.HEALTH);
    if (targetHealth && targetHealth.current <= 0) {
      // When wounded, chain to next target
      if (healthRatio <= 0.5) {
        const nextTarget = this.findNearestAnt(pos, CRICKET_STATS.visionRange * 1.5);
        if (nextTarget) {
          cricket.targetEntityId = nextTarget.entityId;
          combat.targetEntityId = nextTarget.entityId;
          cricket.stateTimer = 0;
          return;
        }
      }
      cricket.state = cricket.previousState;
      cricket.targetEntityId = null;
      combat.targetEntityId = null;
      cricket.stateTimer = 0;
      return;
    }

    const targetPos = this.world.getComponent<PositionComponent>(cricket.targetEntityId!, COMPONENT.POSITION);
    if (!targetPos) {
      cricket.state = cricket.previousState;
      cricket.targetEntityId = null;
      combat.targetEntityId = null;
      cricket.stateTimer = 0;
      return;
    }

    const dist = this.distance(pos, targetPos);

    // Target moved beyond disengage range
    if (dist > CRICKET_STATS.attackRange * disengageMultiplier) {
      cricket.state = cricket.previousState;
      cricket.targetEntityId = null;
      combat.targetEntityId = null;
      cricket.stateTimer = 0;
      return;
    }

    // Timeout — disengage (longer when wounded)
    if (cricket.stateTimer > combatTimeout) {
      cricket.state = cricket.previousState;
      cricket.targetEntityId = null;
      combat.targetEntityId = null;
      cricket.stateTimer = 0;
      return;
    }

    // In range — stay still, CombatSystem handles damage
    if (dist <= CRICKET_STATS.attackRange) {
      path.waypoints = [];
      path.currentIndex = 0;
      combat.targetEntityId = cricket.targetEntityId;
      return;
    }

    // Out of range but not too far — pathfind to target
    if (path.waypoints.length === 0 || path.currentIndex >= path.waypoints.length) {
      const currentPos = { x: Math.round(pos.x), y: Math.round(pos.y) };
      const target = { x: Math.round(targetPos.x), y: Math.round(targetPos.y) };
      const newPath = findPath(this.grid, currentPos, target);
      if (newPath && newPath.length > 0) {
        path.waypoints = newPath;
        path.currentIndex = 0;
      }
    }
  }

  // --- Helpers ---

  private getHealthRatio(entityId: EntityId): number {
    const health = this.world.getComponent<HealthComponent>(entityId, COMPONENT.HEALTH);
    if (!health || health.max === 0) return 1;
    return health.current / health.max;
  }

  private findNearestAnt(
    pos: PositionComponent,
    range: number
  ): { entityId: EntityId; dist: number; x: number; y: number } | null {
    const ants = this.world.query(COMPONENT.ANT, COMPONENT.POSITION);
    let nearest: { entityId: EntityId; dist: number; x: number; y: number } | null = null;
    let nearestDist = Infinity;

    for (const antId of ants) {
      const antPos = this.world.getComponent<PositionComponent>(antId, COMPONENT.POSITION)!;
      const dist = this.distance(pos, antPos);

      if (dist < range && dist < nearestDist) {
        nearestDist = dist;
        nearest = { entityId: antId, dist, x: antPos.x, y: antPos.y };
      }
    }

    return nearest;
  }

  private getNestEntity(): EntityId | null {
    // Cache the nest entity ID
    if (this.cachedNestId !== null && this.world.hasEntity(this.cachedNestId)) {
      return this.cachedNestId;
    }

    const nests = this.world.query(COMPONENT.NEST, COMPONENT.POSITION);
    for (const nestId of nests) {
      this.cachedNestId = nestId;
      return nestId;
    }

    this.cachedNestId = null;
    return null;
  }

  private getNearestEdge(pos: PositionComponent): { x: number; y: number } {
    const distLeft = pos.x;
    const distRight = this.grid.width - 1 - pos.x;
    const distTop = pos.y;
    const distBottom = this.grid.height - 1 - pos.y;

    const minDist = Math.min(distLeft, distRight, distTop, distBottom);

    if (minDist === distLeft) return { x: 0, y: Math.round(pos.y) };
    if (minDist === distRight) return { x: this.grid.width - 1, y: Math.round(pos.y) };
    if (minDist === distTop) return { x: Math.round(pos.x), y: 0 };
    return { x: Math.round(pos.x), y: this.grid.height - 1 };
  }

  private distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}
