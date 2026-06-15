import type { System } from '../../engine/ecs/types';
import type { World } from '../../engine/ecs/World';
import type { TileGrid } from '../../simulation/world/TileGrid';
import {
  COMPONENT,
  type PositionComponent,
  type BeetleDenComponent,
} from '../components/components';
import { createBeetle } from '../entities/factories';
import type { GlobalModifiers } from '../events/GlobalModifiers';
import {
  BEETLE_EDGE_SPAWN_INTERVAL,
  BEETLE_EDGE_SPAWN_CHANCE,
  MAX_TOTAL_BEETLES,
  WORLD_WIDTH,
  WORLD_HEIGHT,
} from '../../shared/constants';

export class BeetleSpawnSystem implements System {
  readonly name = 'BeetleSpawnSystem';
  readonly priority = 50;

  private edgeSpawnTimer = 30; // first edge spawn after 30s

  private world: World;
  private grid: TileGrid;
  private modifiers: GlobalModifiers;

  constructor(world: World, grid: TileGrid, modifiers: GlobalModifiers) {
    this.world = world;
    this.grid = grid;
    this.modifiers = modifiers;
  }

  update(dt: number): void {
    const totalBeetles = this.world.query(COMPONENT.BEETLE).length;

    // Den spawning
    const dens = this.world.query(COMPONENT.BEETLE_DEN, COMPONENT.POSITION);
    for (const denId of dens) {
      const den = this.world.getComponent<BeetleDenComponent>(denId, COMPONENT.BEETLE_DEN)!;
      den.spawnTimer -= dt;

      if (den.spawnTimer <= 0 && den.activeBeetles < den.maxBeetles && totalBeetles < MAX_TOTAL_BEETLES) {
        const denPos = this.world.getComponent<PositionComponent>(denId, COMPONENT.POSITION)!;
        // Offset spawn 1-2 tiles from den
        const angle = Math.random() * Math.PI * 2;
        const offset = 1 + Math.random();
        const sx = denPos.x + Math.cos(angle) * offset;
        const sy = denPos.y + Math.sin(angle) * offset;
        const tx = Math.round(sx);
        const ty = Math.round(sy);

        if (this.grid.isWalkable(tx, ty)) {
          createBeetle(this.world, tx, ty, denId);
          den.activeBeetles++;
        }
        // Night (or events) shorten the respawn window — predators hunt more
        den.spawnTimer = den.spawnCooldown / this.modifiers.enemySpawnMultiplier;
      }
    }

    // Edge spawning
    this.edgeSpawnTimer -= dt;
    if (this.edgeSpawnTimer <= 0) {
      this.edgeSpawnTimer = BEETLE_EDGE_SPAWN_INTERVAL;

      if (Math.random() < BEETLE_EDGE_SPAWN_CHANCE * this.modifiers.enemySpawnMultiplier && totalBeetles < MAX_TOTAL_BEETLES) {
        const pos = this.getRandomEdgePosition();
        if (pos) {
          createBeetle(this.world, pos.x, pos.y, null);
        }
      }
    }
  }

  private getRandomEdgePosition(): { x: number; y: number } | null {
    // Try up to 20 times to find a walkable edge tile
    for (let attempt = 0; attempt < 20; attempt++) {
      const side = Math.floor(Math.random() * 4);
      let x: number, y: number;

      switch (side) {
        case 0: // top
          x = Math.floor(Math.random() * WORLD_WIDTH);
          y = 1;
          break;
        case 1: // bottom
          x = Math.floor(Math.random() * WORLD_WIDTH);
          y = WORLD_HEIGHT - 2;
          break;
        case 2: // left
          x = 1;
          y = Math.floor(Math.random() * WORLD_HEIGHT);
          break;
        default: // right
          x = WORLD_WIDTH - 2;
          y = Math.floor(Math.random() * WORLD_HEIGHT);
          break;
      }

      if (this.grid.isWalkable(x, y)) {
        return { x, y };
      }
    }
    return null;
  }
}
