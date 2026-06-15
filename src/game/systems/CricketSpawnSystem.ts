import type { System } from '../../engine/ecs/types';
import type { World } from '../../engine/ecs/World';
import type { TileGrid } from '../../simulation/world/TileGrid';
import {
  COMPONENT,
  type NestComponent,
  type PositionComponent,
  type CricketDenComponent,
} from '../components/components';
import { createCricket, createCricketDen } from '../entities/factories';
import type { GlobalModifiers } from '../events/GlobalModifiers';
import {
  CRICKET_SPAWN_FOOD_THRESHOLD,
  CRICKET_DEN_MIN_NEST_DISTANCE,
  MAX_TOTAL_CRICKETS,
} from '../../shared/constants';

export class CricketSpawnSystem implements System {
  readonly name = 'CricketSpawnSystem';
  readonly priority = 51;

  private world: World;
  private grid: TileGrid;
  private modifiers: GlobalModifiers;

  constructor(world: World, grid: TileGrid, modifiers: GlobalModifiers) {
    this.world = world;
    this.grid = grid;
    this.modifiers = modifiers;
  }

  update(dt: number): void {
    this.trySpawnDen();
    this.spawnCricketsFromDens(dt);
  }

  private trySpawnDen(): void {
    const nestData = this.getNestData();
    if (!nestData) return;

    const { nest, nestPos } = nestData;

    // Only spawn a den when food threshold is met and no dens exist
    if (nest.foodStored < CRICKET_SPAWN_FOOD_THRESHOLD) return;

    const existingDens = this.world.query(COMPONENT.CRICKET_DEN);
    if (existingDens.length > 0) return;

    // Try up to 50 times to find a valid position
    for (let attempt = 0; attempt < 50; attempt++) {
      const x = Math.floor(Math.random() * this.grid.width);
      const y = Math.floor(Math.random() * this.grid.height);

      if (!this.grid.isWalkable(x, y)) continue;

      const dx = x - nestPos.x;
      const dy = y - nestPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < CRICKET_DEN_MIN_NEST_DISTANCE) continue;

      createCricketDen(this.world, x, y);
      return;
    }
  }

  private spawnCricketsFromDens(dt: number): void {
    const dens = this.world.query(COMPONENT.CRICKET_DEN, COMPONENT.POSITION);
    const totalCrickets = this.world.query(COMPONENT.CRICKET).length;

    for (const denId of dens) {
      const den = this.world.getComponent<CricketDenComponent>(denId, COMPONENT.CRICKET_DEN)!;
      den.spawnTimer -= dt;

      if (den.spawnTimer <= 0) {
        if (den.activeCrickets < den.maxCrickets && totalCrickets < MAX_TOTAL_CRICKETS) {
          const denPos = this.world.getComponent<PositionComponent>(denId, COMPONENT.POSITION)!;

          const angle = Math.random() * Math.PI * 2;
          const offset = 1 + Math.random();
          const spawnX = Math.round(denPos.x + Math.cos(angle) * offset);
          const spawnY = Math.round(denPos.y + Math.sin(angle) * offset);

          if (this.grid.isWalkable(spawnX, spawnY)) {
            createCricket(this.world, spawnX, spawnY, denId);
            den.activeCrickets++;
          }
        }

        // Night (or events) shorten the respawn window — predators hunt more
        den.spawnTimer = den.spawnCooldown / this.modifiers.enemySpawnMultiplier;
      }
    }
  }

  private getNestData(): { nest: NestComponent; nestPos: PositionComponent } | null {
    const nests = this.world.query(COMPONENT.NEST, COMPONENT.POSITION);
    if (nests.length === 0) return null;

    const nestId = nests[0];
    const nest = this.world.getComponent<NestComponent>(nestId, COMPONENT.NEST)!;
    const nestPos = this.world.getComponent<PositionComponent>(nestId, COMPONENT.POSITION)!;

    return { nest, nestPos };
  }
}
