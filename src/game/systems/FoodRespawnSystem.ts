import type { System } from '../../engine/ecs/types';
import type { World } from '../../engine/ecs/World';
import type { TileGrid } from '../../simulation/world/TileGrid';
import type { GlobalModifiers } from '../events/GlobalModifiers';
import { createFood } from '../entities/factories';
import {
  FOOD_RESPAWN_INTERVAL,
  FOOD_PER_CLUSTER_MIN,
  FOOD_PER_CLUSTER_MAX,
  FOOD_AMOUNT_MIN,
  FOOD_AMOUNT_MAX,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  MUSHROOM_SPAWN_CHANCE,
  MUSHROOM_CLUSTER_MIN,
  MUSHROOM_CLUSTER_MAX,
  MUSHROOM_AMOUNT_MIN,
  MUSHROOM_AMOUNT_MAX,
  MUSHROOM_MIN_NEST_DISTANCE,
  GIANT_MUSHROOM_RESPAWN_CHANCE,
  GIANT_MUSHROOM_AMOUNT_MIN,
  GIANT_MUSHROOM_AMOUNT_MAX,
  GIANT_MUSHROOM_SPAWN_DISTANCE_MIN,
  GIANT_MUSHROOM_SPAWN_DISTANCE_MAX,
} from '../../shared/constants';
import { COMPONENT, FoodType, type PositionComponent } from '../components/components';

export class FoodRespawnSystem implements System {
  readonly name = 'FoodRespawnSystem';
  readonly priority = 50;
  private world: World;
  private grid: TileGrid;
  private timer: number = 0;
  private modifiers: GlobalModifiers;

  constructor(world: World, grid: TileGrid, modifiers: GlobalModifiers) {
    this.world = world;
    this.grid = grid;
    this.modifiers = modifiers;
  }

  update(dt: number): void {
    this.timer += dt;

    const effectiveInterval = FOOD_RESPAWN_INTERVAL / this.modifiers.foodSpawnMultiplier;
    if (this.timer >= effectiveInterval) {
      this.spawnFoodCluster();

      // 10% chance to spawn a giant mushroom near nest
      if (Math.random() < GIANT_MUSHROOM_RESPAWN_CHANCE) {
        this.spawnGiantMushroom();
      }

      this.timer = 0;
    }
  }

  private spawnFoodCluster(): void {
    // Find nest position to avoid spawning too close
    const nests = this.world.query(COMPONENT.NEST, COMPONENT.POSITION);
    let nestX = Math.floor(WORLD_WIDTH / 2);
    let nestY = Math.floor(WORLD_HEIGHT / 2);

    if (nests.length > 0) {
      const nestPos = this.world.getComponent<PositionComponent>(nests[0], COMPONENT.POSITION);
      if (nestPos) {
        nestX = Math.round(nestPos.x);
        nestY = Math.round(nestPos.y);
      }
    }

    // Decide if this cluster is mushroom or leaf
    const isMushroom = Math.random() < MUSHROOM_SPAWN_CHANCE;
    const minNestDist = isMushroom ? MUSHROOM_MIN_NEST_DISTANCE : 10;

    // Random position, at least minNestDist tiles from nest
    let cx: number, cy: number;
    do {
      cx = 5 + Math.floor(Math.random() * (WORLD_WIDTH - 10));
      cy = 5 + Math.floor(Math.random() * (WORLD_HEIGHT - 10));
    } while (
      Math.abs(cx - nestX) < minNestDist && Math.abs(cy - nestY) < minNestDist
    );

    if (isMushroom) {
      const count = MUSHROOM_CLUSTER_MIN + Math.floor(Math.random() * (MUSHROOM_CLUSTER_MAX - MUSHROOM_CLUSTER_MIN + 1));
      for (let j = 0; j < count; j++) {
        const fx = cx + Math.floor(Math.random() * 4 - 2);
        const fy = cy + Math.floor(Math.random() * 4 - 2);
        if (this.grid.isWalkable(fx, fy)) {
          const amount = MUSHROOM_AMOUNT_MIN + Math.floor(Math.random() * (MUSHROOM_AMOUNT_MAX - MUSHROOM_AMOUNT_MIN + 1));
          createFood(this.world, fx, fy, amount, FoodType.Mushroom);
        }
      }
    } else {
      const count = FOOD_PER_CLUSTER_MIN + Math.floor(Math.random() * (FOOD_PER_CLUSTER_MAX - FOOD_PER_CLUSTER_MIN));
      for (let j = 0; j < count; j++) {
        const fx = cx + Math.floor(Math.random() * 4 - 2);
        const fy = cy + Math.floor(Math.random() * 4 - 2);
        if (this.grid.isWalkable(fx, fy)) {
          const amount = FOOD_AMOUNT_MIN + Math.floor(Math.random() * (FOOD_AMOUNT_MAX - FOOD_AMOUNT_MIN));
          createFood(this.world, fx, fy, amount, FoodType.Leaf);
        }
      }
    }
  }

  private spawnGiantMushroom(): void {
    // Find nest position
    const nests = this.world.query(COMPONENT.NEST, COMPONENT.POSITION);
    let nestX = Math.floor(WORLD_WIDTH / 2);
    let nestY = Math.floor(WORLD_HEIGHT / 2);

    if (nests.length > 0) {
      const nestPos = this.world.getComponent<PositionComponent>(nests[0], COMPONENT.POSITION);
      if (nestPos) {
        nestX = Math.round(nestPos.x);
        nestY = Math.round(nestPos.y);
      }
    }

    // Spawn at 5-10 tiles from nest
    const gmAngle = Math.random() * Math.PI * 2;
    const gmDist = GIANT_MUSHROOM_SPAWN_DISTANCE_MIN + Math.random() * (GIANT_MUSHROOM_SPAWN_DISTANCE_MAX - GIANT_MUSHROOM_SPAWN_DISTANCE_MIN);
    const gmX = nestX + Math.round(Math.cos(gmAngle) * gmDist);
    const gmY = nestY + Math.round(Math.sin(gmAngle) * gmDist);

    if (this.grid.isWalkable(gmX, gmY)) {
      const gmAmount = GIANT_MUSHROOM_AMOUNT_MIN + Math.floor(Math.random() * (GIANT_MUSHROOM_AMOUNT_MAX - GIANT_MUSHROOM_AMOUNT_MIN + 1));
      createFood(this.world, gmX, gmY, gmAmount, FoodType.GiantMushroom);
    }
  }
}
